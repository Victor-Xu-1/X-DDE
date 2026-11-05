"""History query acceptance over real SQLite, without scientific calculations."""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.models import Status
from opendde_workbench.requests import Properties
from opendde_workbench.store import Store
from opendde_workbench.task_history.kinds import classification_sql, classify_request
from opendde_workbench.task_history.query import history_page
from opendde_workbench.task_history.routes import register_task_history


def create(library, name, project=None, status=Status.CANCELLED):
    job = library.store.create(
        Properties(name=name, smiles=["c1ccccc1"], project_id=project), str(uuid4()), 1000, 2000
    )
    if status != Status.QUEUED:
        assert library.store.claim(expected_id=job.id) is not None
        library.store.finish(job.id, status)
    return library.store.get(job.id)


@pytest.fixture
def library(tmp_path):
    return ExampleLibrary(Store(tmp_path / "jobs.sqlite3"))


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({}, "predict"),
        ({"operation": "harness", "tool": "fold"}, "fold"),
        ({"operation": "docking", "mode": "score"}, "gnina.score"),
        ({"operation": "docking", "mode": "minimize"}, "gnina.minimize"),
        ({"operation": "target_research", "entity": "disease"}, "discovery.disease"),
        ({"operation": "diffsbdd", "payload": {"mode": "interactions"}}, "diffsbdd.interactions"),
        ({"operation": "binding_free_energy"}, "openfe.rbfe"),
        ({"operation": "gromacs_dynamics"}, "gromacs.dynamics"),
        ({"operation": "ternary_model"}, "deepternary.model"),
        ({"operation": "del_analyze"}, "del.analyze"),
        ({"operation": "screening_dock"}, "screening.dock"),
        ({"operation": "molecule_minimize"}, "pose.minimize"),
        ({"operation": "future_method"}, "other"),
    ],
)
def test_sql_and_request_classification_disambiguate_real_request_fields(
    library, payload, expected
):
    sql, parameters = classification_sql()
    with library.store.connect() as db:
        row = db.execute(
            f"SELECT {sql} AS kind FROM (SELECT ? AS request) j", parameters + [json.dumps(payload)]
        ).fetchone()
    assert row["kind"] == expected == classify_request(payload)


def test_pages_include_history_older_than_one_hundred_and_exclude_only_fixed_examples(library):
    jobs = [create(library, f"Controlled metadata history {i:03d}") for i in range(125)]
    fixed = create(library, "Fixed template transport record")
    library.classify([fixed.id])
    setup = create(library, "Internal installation validation")
    library.classify([setup.id], origin="setup_validation")
    before = [(job.id, job.request, job.status) for job in library.store.list_jobs(200)]
    result = history_page(library, capabilities=("properties",), offset=120, limit=20)
    assert result["total"] == 125
    assert len(result["items"]) == 5
    assert jobs[0].id in {item["job"].id for item in result["items"]}
    assert result["counts"] == {"properties": {"total": 125, "active": 0}}
    identifiers = [
        item["job"].id
        for offset in range(0, 125, 20)
        for item in history_page(library, offset=offset)["items"]
    ]
    assert len(identifiers) == len(set(identifiers)) == 125
    assert fixed.id not in identifiers
    assert setup.id not in identifiers
    examples = history_page(library, scope="examples")
    assert examples["total"] == 1 and examples["items"][0]["job"].id == fixed.id
    assert before == [(job.id, job.request, job.status) for job in library.store.list_jobs(200)]


def test_project_counts_do_not_change_with_search_status_and_literal_symbols_are_not_wildcards(
    library,
):
    project = uuid4()
    match = create(library, "STAT6 %_ exact", project)
    create(library, "STAT6 ordinary", project, Status.INTERRUPTED)
    create(library, "Another project", uuid4())
    result = history_page(library, project_id=project, status="cancelled", query="%_")
    assert [item["job"].id for item in result["items"]] == [match.id]
    assert result["counts"]["properties"]["total"] == 2
    assert not history_page(library, project_id=project, query="' OR 1=1 --")["items"]
    assert history_page(library, project_id=project, query=match.id.upper())["total"] == 1
    assert not history_page(library, capabilities=("gnina.dock",))["items"]


def test_equal_timestamps_have_a_deterministic_page_order_and_pending_counts(library):
    jobs = [create(library, "Same task title", status=Status.QUEUED) for _ in range(4)]
    with library.store.connect() as db:
        db.execute("UPDATE jobs SET created_at='2026-10-01T00:00:00Z'")
        db.execute("UPDATE jobs SET status='cancelling' WHERE id=?", (jobs[0].id,))
    first = history_page(library, limit=2)
    second = history_page(library, limit=2, offset=2)
    ids = [item["job"].id for result in (first, second) for item in result["items"]]
    assert ids == sorted((job.id for job in jobs), reverse=True)
    assert first["counts"]["properties"] == {"total": 4, "active": 4}


def test_actual_read_route_validates_boundaries_and_returns_original_request(library):
    job = create(library, "STAT6 original request")
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        response = client.get("/api/task-history?capability=properties&limit=1")
        assert response.status_code == 200
        result = response.json()
        assert result["items"][0]["job"]["request"] == job.request.model_dump(mode="json")
        assert result["items"][0]["capability_id"] == "properties"
        for query in (
            "limit=101",
            "offset=-1",
            "status=unknown",
            "scope=unknown",
            "project_id=bad",
            "capability=unregistered",
            "q=" + "x" * 181,
        ):
            assert client.get("/api/task-history?" + query).status_code == 422
        assert client.get("/api/task-history?offset=999999").json()["items"] == []


def test_local_day_bounds_apply_before_paging_and_preserve_exact_midnight_microseconds(library):
    stamps = [
        "2026-10-01T15:59:59.999999+00:00",  # Just before Oct2 in Shanghai.
        "2026-10-01T16:00:00Z",
        *["2026-10-02T12:00:00+00:00"] * 23,
        "2026-10-02T23:59:59.999999+08:00",  # Still Oct2; SQLite julianday rounds up.
        "2026-10-02T16:00:00+00:00",
    ]
    jobs = [create(library, f"STAT6 dated {i}") for i in range(len(stamps))]
    for job, stamp in zip(jobs, stamps, strict=True):
        with library.store.connect() as db:
            db.execute("UPDATE jobs SET created_at=? WHERE id=?", (stamp, job.id))
    fixed = create(library, "Fixed dated reference")
    library.classify([fixed.id])
    with library.store.connect() as db:
        db.execute("UPDATE jobs SET created_at=? WHERE id=?", (stamps[2], fixed.id))
    before = [(job.id, job.created_at, job.status) for job in library.store.list_jobs(100)]
    bounds = {
        "created_from": "2026-10-02T00:00:00+08:00",
        "created_before": "2026-10-03T00:00:00+08:00",
        "capability": "properties",
    }
    app = FastAPI()
    register_task_history(app, library)
    with TestClient(app) as client:
        first = client.get("/api/task-history", params={**bounds, "limit": 20}).json()
        second = client.get(
            "/api/task-history", params={**bounds, "limit": 20, "offset": 20}
        ).json()
        ids = {item["job"]["id"] for result in (first, second) for item in result["items"]}
        assert first["total"] == second["total"] == 25
        assert ids == {job.id for job in jobs[1:-1]}
        assert first["counts"]["properties"]["total"] == len(jobs)
        examples = client.get("/api/task-history", params={**bounds, "scope": "examples"}).json()
        assert [item["job"]["id"] for item in examples["items"]] == [fixed.id]
        assert (
            client.get("/api/task-history", params={**bounds, "status": "failed"}).json()["total"]
            == 0
        )
        for extra in (
            {"created_from": "2026-10-02"},
            {"created_before": "bad"},
            {"created_from": "2026-10-03T00:00:00+08:00"},
            {"created_from": "2026-10-04T00:00:00+08:00"},
        ):
            assert client.get("/api/task-history", params={**bounds, **extra}).status_code == 422
    assert before == [(job.id, job.created_at, job.status) for job in library.store.list_jobs(100)]
    # Legacy UTC timestamps without an offset continue to be readable.
    with library.store.connect() as db:
        db.execute("UPDATE jobs SET created_at='2026-10-02T01:00:00' WHERE id=?", (jobs[0].id,))
    assert history_page(library, created_from=datetime(2026, 10, 2, tzinfo=UTC))["total"] == 26
