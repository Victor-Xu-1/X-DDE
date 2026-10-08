"""Actual readonly MOL transport, source integrity and idempotent preservation; no inference."""

import hashlib
import json
import sqlite3
from uuid import uuid4

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.store import Store

MOL = """preserved test record
  X-DDE          3D

  3  2  0  0  0  0            999 V2000
    1.0000    2.0000    3.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.2000    2.0000    3.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    2.2000    3.3000    3.5000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
"""


def prepared_index(settings):
    task = DatasetTask.model_validate(
        {
            "name": "controlled indexed record",
            "operation": "drugclip_index",
            "payload": {"kind": "drugclip", "mode": "index", "use": "non_commercial"},
            "sources": [{"role": "library", "job_id": str(uuid4()), "report_sha256": "a" * 64}],
        }
    )
    store = Store(settings.state_dir / "jobs.sqlite3")
    job = store.create(task, str(uuid4()), max_pending=8, max_jobs=100)
    with store.connect() as db:
        db.execute("UPDATE jobs SET status='succeeded' WHERE id=?", (job.id,))
    root = settings.state_dir / "jobs" / job.id / "output"
    root.mkdir(parents=True)
    file = root / "index-members.sqlite"
    with sqlite3.connect(file) as db:
        db.execute(
            "CREATE TABLE members (id TEXT PRIMARY KEY,display_name TEXT,supplier TEXT,"
            "source_job TEXT,source_record INTEGER,molblock TEXT)"
        )
        db.execute(
            "INSERT INTO members VALUES (?,?,?,?,?,?)",
            ("member-1", "Exact native member", "custom", str(uuid4()), 17, MOL),
        )
    result = {
        "operation": "drugclip_index",
        "program": "drugclip",
        "version": "test",
        "schema_version": 1,
        "complete": True,
        "request_sha256": hashlib.sha256(task.model_dump_json().encode()).hexdigest(),
        "data_kind": "index",
        "artifacts": [
            {
                "name": file.name,
                "role": "embedding_row_identities",
                "format": "sqlite",
                "size": file.stat().st_size,
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            }
        ],
        "counts": {"indexed": 1},
        "candidates": [],
        "metrics": {},
        "metadata": {},
        "warnings": [],
    }
    (root / "result.json").write_text(json.dumps(result))
    return store, job.id, file


def test_native_structure_reads_do_not_create_assets_and_save_is_exact_and_idempotent(
    settings, client_factory
):
    store, job, file = prepared_index(settings)
    before = file.read_bytes()
    with client_factory() as client:
        detail = client.get(f"/api/datasets/{job}/members/detail?member_id=member-1")
        assert detail.status_code == 200, detail.text
        data = detail.json()
        molecular = client.get(data["url"])
        assert molecular.status_code == 200 and molecular.content == MOL.encode()
        assert molecular.headers["X-Structure-Format"] == "mol"
        assert not client.get("/api/assets").json()
        body = {"member_id": "member-1", "report_sha256": data["report_sha256"]}
        denied = client.post(
            f"/api/datasets/{job}/members/preserve", json=body, headers={"X-Workbench-CSRF": ""}
        )
        assert denied.status_code == 403
        first = client.post(f"/api/datasets/{job}/members/preserve", json=body)
        assert first.status_code == 200, first.text
        second = client.post(f"/api/datasets/{job}/members/preserve", json=body)
        assert first.json() == second.json()
        saved = first.json()
        assert saved["source_job"] == job and saved["validation"] == "native_prepared"
        assert saved["reference"]["sha256"] == hashlib.sha256(MOL.encode()).hexdigest()
        assert len(client.get("/api/assets").json()) == 1
        assert client.get("/api/assets/" + saved["reference"]["asset_id"]).content == MOL.encode()
        assert client.get(data["url"].replace(data["report_sha256"], "0" * 64)).status_code == 409
    assert file.read_bytes() == before
    assert len(store.list_jobs()) == 1


def test_invalid_members_and_changed_native_files_cannot_be_previewed(settings, client_factory):
    _, job, file = prepared_index(settings)
    with client_factory() as client:
        assert (
            client.get(f"/api/datasets/{job}/members/detail?member_id=' OR 1=1 --").status_code
            == 422
        )
        raw = file.read_bytes()
        file.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
        assert (
            client.get(f"/api/datasets/{job}/members/detail?member_id=member-1").status_code == 422
        )
