"""Actual archived native results and cold restore; no scientific engines are executed."""

import hashlib
import json
import os
import zipfile
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.deployment.catalog import PACKAGES, dependencies
from opendde_workbench.examples import stat6_bundle_release as source
from opendde_workbench.examples.bundle import restore_bundle, verify_examples
from opendde_workbench.store import Store

NATIVE_EXAMPLES = {
    "predict": "716024e7-0a4a-4b9f-8962-fae4257bba48",
    "epitope": "2d356d5b-b02d-4dea-be17-118234f9c62c",
    "esm": "081476d2-6fcf-4e17-b7c0-18576f848938",
    "protrek-sequence": "39a51984-ac65-4a02-a164-7134cdc8beea",
    "import": "a7b7271b-39e6-40dc-84ac-94e8d76ddbf5",
    "features": "f71f9f99-a40b-41bc-a108-18afc4d6202a",
    "evolution": "92943087-2a75-412f-8124-d5805b9765c1",
    "compare": "5d23c69d-a17f-4ae1-95c6-970f8c46c9c8",
    "target-msa": "8f11132b-a1c8-4d60-b93f-2e1aab51eec3",
    "chemprop.predict": "1df43d87-9bf1-4a4e-9689-1935e516db9e",
}


def result_path(settings, identifier):
    return settings.state_dir / "jobs" / identifier / "output/result.json"


def check_complete_alignment_downloads(client, settings):
    identifier = NATIVE_EXAMPLES["target-msa"]
    path = result_path(settings, identifier)
    result = json.loads(path.read_text())
    assert result["complete"] and result["result"]["cached"]
    assert result["result"]["alignment_depth"] == 3245
    for row, expected_rows in zip(result["result"]["alignment_files"], (3245, 1), strict=True):
        response = client.get(f"/api/jobs/{identifier}/download", params={"name": row["artifact"]})
        assert response.status_code == 200
        assert response.content == path.with_name(row["artifact"]).read_bytes()
        assert hashlib.sha256(response.content).hexdigest() == row["sha256"]
        assert len(response.content) == row["bytes"]
        assert response.content.count(b">") == row["rows"] == expected_rows
        assert row["columns"] == 847


def check_exploratory_model_limits(settings):
    prediction = json.loads(result_path(settings, NATIVE_EXAMPLES["chemprop.predict"]).read_text())
    assert (
        prediction["complete"]
        and prediction["scope"] == "native_computation_not_experimental_measurement"
    )
    assert prediction["candidates"][0]["metrics"][0]["value"] == 6.8405423
    path = result_path(settings, NATIVE_EXAMPLES["chemprop.predict"]).with_name(
        "source-record-001.sdf"
    )
    assert hashlib.sha256(path.read_bytes()).hexdigest() == (
        "d1d34633711dec2c0da53add660dd47d766f25c807df5ad73465908686713e32"
    )
    training = json.loads(result_path(settings, "d90b04d5-f76d-44db-8762-78ff550dc1ec").read_text())
    metrics = {row["name"]: row["value"] for row in training["metrics"]}
    assert metrics["Test molecules"] == 16
    assert metrics["Test R²"] == pytest.approx(-0.19374784151046387)


def test_stat6_data_component_uses_the_existing_data_authority():
    package = PACKAGES["public-stat6-examples"]
    assert package.kind == "data" and package.version == source.VERSION == "28"
    assert package.url == source.URL and package.checksum == source.SHA256
    assert dependencies(package.id) == [package.id]
    assert len(source.CAPABILITIES) == len(set(source.CAPABILITIES)) == 54
    assert not set(source.CAPABILITIES) & {"openmm.dynamics", "gromacs.dynamics", "openfe.rbfe"}


def test_actual_stat6_archive_restores_complete_results_without_execution(settings):
    filename = os.environ.get("WB_REVIEWED_STAT6_ARCHIVE")
    if not filename:
        pytest.skip("The scoped delivery gate supplies the immutable reviewed STAT6 archive")
    archive = Path(filename)
    assert archive.stat().st_size == source.BYTES
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
    assert manifest["profile"] == "stat6"
    assert manifest["source_revision"] == source.SOURCE_REVISION
    assert manifest["capabilities"] == list(source.CAPABILITIES)
    app = create_app(replace(settings, allowed_origins=("http://127.0.0.1:4322",)))
    store = Store(settings.state_dir / "jobs.sqlite3")
    private = str(uuid4())
    with store.connect() as db:
        db.execute(
            "INSERT INTO projects VALUES(?,?,?,?)",
            (private, "Personal research", "Retain", "today"),
        )
    summary = {"modules": 54, "computed": 54, "validated": 0}
    assert restore_bundle(archive, settings, source.SHA256) == summary
    assert verify_examples(settings, source.CAPABILITIES, profile="stat6") == summary
    with TestClient(app, base_url="http://127.0.0.1:4322") as client:
        for capability, identifier in NATIVE_EXAMPLES.items():
            response = client.get("/api/examples/" + capability)
            assert response.status_code == 200
            value = response.json()
            assert value["computed_result_available"]
            assert value["pin"]["job_id"] == identifier
            assert value["pin"]["review"]["scope"] == "reviewed_computational_example"
            assert store.get(identifier).status == "succeeded"
        check_complete_alignment_downloads(client, settings)
        check_exploratory_model_limits(settings)
        job = store.get(NATIVE_EXAMPLES["predict"])
        assert len(job.request.components) == 1
        assert len(job.request.components[0].value) == 116
        response = client.post(
            "/api/examples/predict/prepare",
            headers={
                "Origin": "http://127.0.0.1:4322",
                "X-Workbench-CSRF": client.get("/api/session").json()["csrf_token"],
            },
        )
        assert response.status_code == 200
        prepared = response.json()
        with store.connect() as db:
            original_request = db.execute(
                "SELECT request FROM jobs WHERE id=?", (job.id,)
            ).fetchone()[0]
        assert prepared["request"] == json.loads(original_request)
        assert "protein sequence" in prepared["study"]["guide"]["steps"][0][1]
        alignment = prepared["objects"]["prediction_msa"]
        assert alignment["reference"]["asset_id"] == str(job.request.components[0].unpaired_msa)
    tables = ("jobs", "assets", "example_pins", "example_record_pins", "scientific_objects")
    with store.connect() as db:
        before = {
            table: [tuple(row) for row in db.execute("SELECT * FROM " + table)] for table in tables
        }
        assert not db.execute(
            "SELECT id FROM jobs WHERE status IN ('queued','running','cancelling')"
        ).fetchall()
        assert (
            db.execute("SELECT description FROM projects WHERE id=?", (private,)).fetchone()[0]
            == "Retain"
        )
    assert restore_bundle(archive, settings, source.SHA256) == summary
    with store.connect() as db:
        assert before == {
            table: [tuple(row) for row in db.execute("SELECT * FROM " + table)] for table in tables
        }
