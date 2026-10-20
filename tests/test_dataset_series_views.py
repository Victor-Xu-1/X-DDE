"""Native SQLite search/filter paging with escaped identifiers; no scientific execution."""

import hashlib
import json
import sqlite3
from uuid import uuid4

import pytest

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.store import Store


def completed_tables(settings):
    task = DatasetTask(
        name="Retained series view fixture",
        operation="del_series",
        sources=[{"job_id": str(uuid4()), "role": "analysis", "report_sha256": "a" * 64}],
        payload={"kind": "deli", "mode": "series", "chosen_comparison": "target_vs_control"},
    )
    store = Store(settings.state_dir / "jobs.sqlite3")
    job = store.create(task, str(uuid4()), max_pending=8, max_jobs=100)
    with store.connect() as db:
        db.execute("UPDATE jobs SET status='succeeded' WHERE id=?", (job.id,))
    root = settings.state_dir / "jobs" / job.id / "output"
    root.mkdir(parents=True)
    series = root / "series.sqlite"
    with sqlite3.connect(series) as db:
        db.execute(
            "CREATE TABLE series (kind TEXT,cycle_a INTEGER,cycle_b INTEGER,"
            "block_a TEXT,block_b TEXT,members INTEGER,selection INTEGER,"
            "reference INTEGER,score REAL)"
        )
        db.executemany(
            "INSERT INTO series VALUES (?,?,?,?,?,?,?,?,?)",
            [
                ("di", 1, 2, "B040", "C030", 30, 100, 2, 9),
                ("mono", 1, -1, "B040", "", 200, 200, 10, 5),
                ("di", 1, 2, "B001", "C100%", 10, 60, 2, 4),
                ("mono", 2, -1, "C100%", "", 100, 60, 2, 4),
                ("di", 1, 2, "B_002", "C100X", 10, 2, 2, 1),
            ],
        )
    followup = root / "followup.sqlite"
    with sqlite3.connect(followup) as db:
        db.execute("CREATE TABLE measurements (record INTEGER,member TEXT,value REAL)")
        db.executemany(
            "INSERT INTO measurements VALUES (?,?,?)",
            [
                (0, "A035-B040-C030", 5.0),
                (1, "A_100%", None),
                (2, "AX100Y", 4.0),
            ],
        )
    artifacts = [
        {
            "name": path.name,
            "role": role,
            "format": "sqlite",
            "size": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        for path, role in (
            (series, "del_series_counts"),
            (followup, "reported_followup_measurements"),
        )
    ]
    result = {
        "operation": "del_series",
        "program": "deli",
        "version": "fixture",
        "complete": True,
        "schema_version": 1,
        "data_kind": "analysis",
        "request_sha256": hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        "artifacts": artifacts,
        "counts": {"series": 5, "reported": 3},
        "candidates": [],
        "metadata": {},
        "metrics": {},
        "warnings": [],
    }
    (root / "result.json").write_text(json.dumps(result))
    return store, job.id, {path: path.read_bytes() for path in (series, followup)}


@pytest.mark.parametrize(
    "search,kind,expected",
    [
        ("B040", "all", [("B040", "C030"), ("B040", "")]),
        ("B040", "mono", [("B040", "")]),
        ("C030", "di", [("B040", "C030")]),
        ("100%", "all", [("B001", "C100%"), ("C100%", "")]),
        ("B_002", "all", [("B_002", "C100X")]),
        ("' OR 1=1 --", "all", []),
    ],
)
def test_series_search_and_kind_are_combined_literal_readonly_filters(
    settings, client_factory, search, kind, expected
):
    store, job, originals = completed_tables(settings)
    with client_factory() as client:
        response = client.get(
            f"/api/datasets/{job}/table",
            params={"view": "series", "search": search, "series_kind": kind},
        )
        assert response.status_code == 200, response.text
        assert [(r["block_a"], r["block_b"]) for r in response.json()["rows"]] == expected
        assert response.json()["total"] == 5  # total dataset, not a fabricated matched count
    assert len(store.list_jobs()) == 1
    assert all(path.read_bytes() == raw for path, raw in originals.items())


def test_paging_invalid_kind_and_followup_search(settings, client_factory):
    _, job, originals = completed_tables(settings)
    with client_factory() as client:
        path = f"/api/datasets/{job}/table"
        first = client.get(path, params={"view": "series", "search": "B040", "limit": 1}).json()
        assert first["has_more"] and first["rows"][0]["kind"] == "di"
        second = client.get(
            path, params={"view": "series", "search": "B040", "limit": 1, "offset": 1}
        ).json()
        assert not second["has_more"] and second["rows"][0]["kind"] == "mono"
        assert (
            client.get(path, params={"view": "series", "series_kind": "unknown"}).status_code == 422
        )
        for search, expected in [
            ("B040", ["A035-B040-C030"]),
            ("A_100%", ["A_100%"]),
            ("' OR 1=1 --", []),
        ]:
            response = client.get(path, params={"view": "followup", "search": search})
            assert response.status_code == 200, response.text
            assert [row["member"] for row in response.json()["rows"]] == expected
    assert all(path.read_bytes() == raw for path, raw in originals.items())
