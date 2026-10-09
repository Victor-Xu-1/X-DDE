"""Changed default profile, typed input requests and archival isolation only."""

import json
from uuid import uuid4

import pytest
from test_stat6_templates import scientific_store

from opendde_workbench.examples.catalogue import MODULES as ARCHIVE_MODULES
from opendde_workbench.examples.contracts import ExamplePin
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6 import catalogue
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER, Properties
from opendde_workbench.store import now


def test_default_api_returns_stat6_for_every_module_and_prepares_without_jobs(client_factory):
    with client_factory() as client:
        response = client.get("/api/examples")
        assert response.status_code == 200
        values = response.json()["examples"]
        assert {value["module"]["capability_id"] for value in values} == set(catalogue.MODULES)
        for value in values:
            assert value["case"]["id"] == catalogue.CASE.id
            assert not value["computed_result_available"]
            capability = value["module"]["capability_id"]
            detail = client.get("/api/examples/" + capability)
            assert detail.status_code == 200 and detail.json()["study"]["target"] == "STAT6"
            prepared = client.post("/api/examples/" + capability + "/prepare")
            assert prepared.status_code == 200, prepared.text
            data = prepared.json()
            assert data["case"]["id"] == catalogue.CASE.id
            assert data["record"] is None and data["source_record"] is None
            if data["request"]:
                TASK_ADAPTER.validate_python(data["request"])
        assert client.get("/api/jobs").json() == []
        assert len(client.get("/api/assets").json()) == len(catalogue.FILES)
        assert client.get("/api/examples/predict?profile=unknown").status_code == 422


def test_archive_is_explicit_and_does_not_replace_active_study_pins(tmp_path):
    store, scientific = scientific_store(tmp_path)
    old_pins = ExamplePins(store, tmp_path)
    module = ARCHIVE_MODULES["properties"]
    # A pointer-only database fixture; this is not a native scientific result.
    old = ExamplePin(
        capability_id="properties",
        case_id=module.case_id,
        revision=module.revision,
        job_id=uuid4(),
        request_sha256="a" * 64,
        environment_sha256="b" * 64,
        artifact_sha256={},
        created_at=now(),
    )
    with store.connect() as db:
        db.execute(
            "INSERT INTO example_pins VALUES(?,?,?,?)",
            ("properties", module.revision, str(old.job_id), old.model_dump_json()),
        )
    current = ExamplePins(store, tmp_path, modules=catalogue.MODULES)
    assert current.get("properties") is None
    assert old_pins.get("properties") == old
    prepare_stat6("properties", scientific)
    assert old_pins.get("properties") == old
    with store.connect() as db:
        assert (
            json.loads(db.execute("SELECT body FROM example_pins").fetchone()[0])["case_id"]
            == module.case_id
        )


def test_archived_molecule_job_cannot_be_pinned_as_a_stat6_result(tmp_path):
    store, scientific = scientific_store(tmp_path)
    old = scientific.assets.save("old-case.sdf", "ligand", b"controlled protocol input\n$$$$\n")
    request = Properties(ligand_files=[old.id])
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    store.finish(job.id, Status.SUCCEEDED)
    pins = ExamplePins(store, tmp_path, modules=catalogue.MODULES)
    with pytest.raises(ValueError, match="scientific lineage"):
        pins.pin("properties", job.id, prepare_stat6("properties", scientific))
    assert pins.get("properties") is None


def test_explicit_archive_metadata_retains_original_case(client_factory):
    with client_factory() as client:
        archive = client.get("/api/examples/p2rank.detect?profile=archive")
        current = client.get("/api/examples/p2rank.detect")
        assert archive.status_code == current.status_code == 200
        assert archive.json()["case"]["id"] == "brd4-jq1"
        assert current.json()["case"]["id"] == catalogue.CASE.id
        assert current.json()["module"]["revision"] == archive.json()["module"]["revision"] + 1
