"""Task title identities over real SQLite and existing pins, without calculation."""

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_example_source_titles import persist_pin
from test_task_history import create

from opendde_workbench.examples.catalogue import CASES, MODULES
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.examples.stat6.catalogue import CASE
from opendde_workbench.store import Store
from opendde_workbench.task_history.routes import register_task_history


@pytest.fixture
def library(tmp_path):
    return ExampleLibrary(Store(tmp_path / "jobs.sqlite3"))


def snapshot(library):
    with library.store.connect() as db:
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        return {
            table: [tuple(row) for row in db.execute('SELECT * FROM "' + table + '"')]
            for table in tables
        }


@pytest.mark.parametrize("record,capability", [(False, "properties"), (True, "regions")])
def test_direct_identity_includes_both_pin_types_without_rewriting_history(
    library, record, capability
):
    job = create(library, "Public native transport-engine")
    persist_pin(library, job, capability, record=record)
    before = snapshot(library)
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        response = client.get(f"/api/task-history/{job.id}/identity")
        assert response.status_code == 200
        value = response.json()
        case = CASES[MODULES[capability].case_id]
        assert value == {
            "job_id": job.id,
            "capability_id": "properties",
            "origin": "fixed_example",
            "example_cases": [{"id": case.id, "label": list(case.label)}],
        }
    assert snapshot(library) == before
    assert library.store.get(job.id).request == job.request


def test_stat6_identity_is_derived_from_the_pin_and_never_from_its_title(library):
    job = create(library, "BRD4 misleading engine title")
    persist_pin(library, job, "properties", study=True)
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        value = client.get(f"/api/task-history/{job.id}/identity").json()
        assert value["example_cases"] == [{"id": CASE.id, "label": list(CASE.label)}]
    assert library.store.get(job.id).request == job.request


def test_direct_open_uses_a_new_pin_before_history_origin_has_been_refreshed(library):
    job = create(library, "Public native transport-engine")
    persist_pin(library, job, "properties", study=True)
    # Pin producers commit the pin before the independent history-role refresh.
    with library.store.connect() as db:
        db.execute("DELETE FROM example_library_tasks WHERE job_id=?", (job.id,))
    before = snapshot(library)
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        value = client.get(f"/api/task-history/{job.id}/identity").json()
        assert value["origin"] == "fixed_example"
        assert value["example_cases"] == [{"id": CASE.id, "label": list(CASE.label)}]
    assert snapshot(library) == before


def test_personal_unlinked_example_and_setup_origins_remain_explicit(library):
    personal, public, setup = [
        create(library, name)
        for name in ("STAT6 researcher notes", "Unlinked engine title", "Internal setup")
    ]
    library.classify([public.id])
    library.classify([setup.id], origin="setup_validation")
    before = snapshot(library)
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        for job, origin in (
            (personal, "research"),
            (public, "fixed_example"),
            (setup, "setup_validation"),
        ):
            value = client.get(f"/api/task-history/{job.id}/identity").json()
            assert value["origin"] == origin and value["example_cases"] == []
            assert library.store.get(job.id).request.name == job.request.name
        assert client.get(f"/api/task-history/{uuid4()}/identity").status_code == 404
        assert client.get("/api/task-history/not-a-uuid/identity").status_code == 422
    assert snapshot(library) == before


def test_invalid_pin_metadata_fails_without_exposing_private_details(library):
    job = create(library, "Controlled case")
    persist_pin(library, job, "properties")
    with library.store.connect() as db:
        db.execute("UPDATE example_pins SET body=?", ('{"private":"/internal/path"}',))
    before = snapshot(library)
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        response = client.get(f"/api/task-history/{job.id}/identity")
        assert response.status_code == 409
        assert "/internal" not in response.text
    assert snapshot(library) == before
