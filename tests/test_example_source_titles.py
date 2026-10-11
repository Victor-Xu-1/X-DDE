"""Real persisted pin/case projection; controlled metadata only, never scientific results."""

from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_task_history import create

from opendde_workbench.examples.catalogue import CASES, MODULES
from opendde_workbench.examples.contracts import ExamplePin, ExampleRecordPin, JobEvidence
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.examples.stat6.catalogue import CASE
from opendde_workbench.examples.stat6.catalogue import MODULES as STUDY_MODULES
from opendde_workbench.store import Store
from opendde_workbench.task_history.query import history_page
from opendde_workbench.task_history.routes import register_task_history


@pytest.fixture
def library(tmp_path):
    return ExampleLibrary(Store(tmp_path / "jobs.sqlite3"))


def persist_pin(
    library, job, capability, *, study=False, record=False, revision=None, evidence_jobs=None
):
    module = (STUDY_MODULES if study else MODULES)[capability]
    evidence = JobEvidence(
        job_id=job.id, request_sha256="a" * 64, environment_sha256="b" * 64, artifact_sha256={}
    )
    common = {
        "capability_id": capability,
        "case_id": module.case_id,
        "revision": revision or module.revision,
        "created_at": "2026-10-11T00:00:00Z",
    }
    if record:
        entries = (
            tuple(evidence.model_copy(update={"job_id": UUID(item.id)}) for item in evidence_jobs)
            if evidence_jobs
            else (evidence,)
        )
        value = ExampleRecordPin(
            **common,
            record_id=uuid4(),
            record_sha256="c" * 64,
            evidence=entries,
            computed_result_available=False,
        )
        table = "example_record_pins"
    else:
        value = ExamplePin(**common, **evidence.model_dump())
        table = "example_pins"
    with library.store.connect() as db:
        db.execute(
            f"CREATE TABLE IF NOT EXISTS {table} (capability_id TEXT, revision INTEGER, "
            "body TEXT, PRIMARY KEY(capability_id,revision))"
        )
        db.execute(
            f"INSERT INTO {table} VALUES(?,?,?)",
            (capability, value.revision, value.model_dump_json()),
        )
    library.classify([item.id for item in evidence_jobs] if evidence_jobs else [job.id])
    return value


def test_fixed_case_labels_search_paging_and_original_requests_share_existing_authority(library):
    originals = [create(library, f"Public native transport-engine {index}") for index in range(26)]
    persist_pin(library, originals[0], "regions", record=True, evidence_jobs=originals)
    case = CASES[MODULES["regions"].case_id]
    first = history_page(library, scope="examples", query=case.label[1], limit=20)
    second = history_page(library, scope="examples", query=case.label[0], offset=20, limit=20)
    assert first["total"] == second["total"] == 26
    assert len(first["items"]) == 20 and len(second["items"]) == 6
    for item in first["items"] + second["items"]:
        assert item["example_cases"] == [{"id": case.id, "label": case.label}]
        assert item["job"].request.name.startswith("Public native transport-engine")
    assert not history_page(library, scope="research")["items"]
    assert not history_page(library, scope="examples", query="' OR 1=1 --")["items"]
    assert all(library.store.get(job.id).request == job.request for job in originals)


def test_archived_and_stat6_pins_remain_distinct_and_unknown_titles_are_not_guessed(library):
    old, new, unlinked = [
        create(library, name)
        for name in ("STAT6 misleading title", "BRD4 misleading title", "STAT6 unlinked title")
    ]
    persist_pin(library, old, "properties")
    persist_pin(library, new, "properties", study=True)
    library.classify([unlinked.id])
    by_id = {
        item["job"].id: item["example_cases"]
        for item in history_page(library, scope="examples")["items"]
    }
    assert by_id[old.id][0]["id"] == MODULES["properties"].case_id
    assert by_id[new.id] == [{"id": CASE.id, "label": CASE.label}]
    assert by_id[unlinked.id] == []


def test_record_pin_evidence_is_linked_but_unreviewed_revisions_are_not_relabelled(library):
    linked, outdated = [
        create(library, name) for name in ("Linked transport record", "Outdated transport record")
    ]
    persist_pin(library, linked, "regions", record=True)
    persist_pin(library, outdated, "properties", revision=MODULES["properties"].revision + 100)
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        result = client.get("/api/task-history?scope=examples").json()
        rows = {item["job"]["id"]: item for item in result["items"]}
        assert rows[linked.id]["example_cases"][0]["id"] == MODULES["regions"].case_id
        assert rows[outdated.id]["example_cases"] == []
        assert rows[linked.id]["job"]["request"] == linked.request.model_dump(mode="json")


def test_corrupt_case_metadata_has_explicit_failure_and_never_exposes_its_private_body(library):
    job = create(library, "Controlled case metadata")
    persist_pin(library, job, "properties")
    with library.store.connect() as db:
        db.execute("UPDATE example_pins SET body=?", ('{"private":"/internal/path"}',))
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        response = client.get("/api/task-history?scope=examples")
        assert response.status_code == 409
        assert "original case records" in response.json()["detail"]
        assert "/internal" not in response.text
    assert library.store.get(job.id).request == job.request
