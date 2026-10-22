"""Model reuse keeps its exact held-out evidence; fixture checkpoints are never executed."""

import hashlib
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_model_case_sources import model_files

from opendde_workbench.integrations.bindings import trained_model
from opendde_workbench.integrations.routes import register_scientific_routes
from opendde_workbench.models import Status
from opendde_workbench.store import Store


@pytest.fixture
def model_context(settings):
    settings.state_dir.mkdir()
    store = Store(settings.state_dir / "jobs.sqlite3")
    task, _ = model_files(settings.state_dir / "prototype")
    job = store.create(task, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    model_files(output, task.inputs[0].source.model_dump(mode="json"))
    report = json.loads((output / "result.json").read_bytes())
    report.update(
        metrics=[
            {
                "name": name,
                "value": value,
                "unit": unit,
                "method": "Controlled held-out evidence fixture",
                "meaning": "validation",
            }
            for name, value, unit in (
                ("Test RMSE", 0.9588102921, task.payload.activity_unit),
                ("Test R²", -0.1937478415, "dimensionless"),
                ("Test molecules", 2, "count"),
            )
        ],
        validation_points=[
            {"smiles": "c1ccccc1N", "observed": 1.0, "predicted": 1.5},
            {"smiles": "c1ccccc1O", "observed": 2.0, "predicted": 1.5},
        ],
    )
    (output / "result.json").write_text(json.dumps(report))
    store.finish(job.id, Status.SUCCEEDED)
    app = FastAPI()
    register_scientific_routes(app, store, settings)
    with TestClient(app) as client:
        yield client, store, job, output, report


def test_exact_model_lookup_keeps_negative_validation_without_rounding_or_mutation(model_context):
    client, store, job, output, report = model_context
    before = {file.name: file.read_bytes() for file in output.iterdir()}
    result = client.get(f"/api/scientific/property-models/{job.id}")
    assert result.status_code == 200
    model = result.json()
    assert model["validation_metrics"] == report["metrics"]
    assert model["validation_records"] == 2
    assert model["sha256"] == report["artifact_sha256"]["property-model.pt"]
    assert model["source_report_sha256"] == hashlib.sha256(before["result.json"]).hexdigest()
    assert model["activity_unit"] == job.request.payload.activity_unit
    assert client.get("/api/scientific/property-models").json()["models"] == [model]
    assert {file.name: file.read_bytes() for file in output.iterdir()} == before
    assert store.get(job.id).status == "succeeded"


def test_legacy_model_has_unassessed_evidence_rather_than_invented_zero_errors(model_context):
    client, _, job, output, report = model_context
    report.pop("metrics")
    report.pop("validation_points")
    (output / "result.json").write_text(json.dumps(report))
    model = client.get(f"/api/scientific/property-models/{job.id}").json()
    assert model["validation_metrics"] == [] and model["validation_records"] == 0


@pytest.mark.parametrize("change", ["checkpoint", "request", "missing_report"])
def test_unverifiable_model_is_not_available_for_reuse(model_context, change):
    client, _, job, output, report = model_context
    if change == "checkpoint":
        (output / "property-model.pt").write_bytes(b"Different checkpoint")
    elif change == "request":
        report["request_sha256"] = "f" * 64
        (output / "result.json").write_text(json.dumps(report))
    else:
        (output / "result.json").unlink()
    response = client.get(f"/api/scientific/property-models/{job.id}")
    assert response.status_code == 409
    assert str(output) not in response.text
    assert client.get("/api/scientific/property-models").json()["models"] == []


@pytest.mark.parametrize("field", ["model_sha256", "activity_property", "activity_unit"])
def test_execution_and_model_context_share_the_exact_selected_source(model_context, field):
    _, store, job, output, report = model_context
    fields = {
        "model_job": job.id,
        "model_sha256": report["artifact_sha256"]["property-model.pt"],
        "activity_property": job.request.payload.activity_property,
        "activity_unit": job.request.payload.activity_unit,
    }
    assert trained_model(output.parents[2], store, SimpleNamespace(**fields)) == (
        output / "property-model.pt"
    )
    fields[field] = "b" * 64 if field == "model_sha256" else "another endpoint"
    with pytest.raises(ValueError):
        trained_model(output.parents[2], store, SimpleNamespace(**fields))


def test_unknown_model_is_not_a_validated_empty_model(model_context):
    client, _, _, _, _ = model_context
    assert client.get(f"/api/scientific/property-models/{uuid4()}").status_code == 404
