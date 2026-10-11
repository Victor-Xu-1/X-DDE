"""History query acceptance over real SQLite, without scientific calculations."""

import json
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
            "project_id=bad",
            "capability=unregistered",
            "q=" + "x" * 181,
        ):
            assert client.get("/api/task-history?" + query).status_code == 422
        assert client.get("/api/task-history?offset=999999").json()["items"] == []
