"""Freeze and cold-restore actual accepted analysis, without another task authority."""

import hashlib
import json
import os
from dataclasses import replace

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.store import Store

CAPABILITIES = ("pose_exploration", "pose.cluster")


def freeze_case(settings, output, identifier, result):
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        prepared = client.post("/api/examples/pose.cluster/prepare")
        assert prepared.status_code == 200, prepared.text
        assert prepared.json()["source_record"]["poses"][0]["id"] == result["pose_set_id"]
        body = {"job_id": identifier}
        first = client.post("/api/examples/pose.cluster/pin", json=body)
        assert first.status_code == 200, first.text
        assert client.post("/api/examples/pose.cluster/pin", json=body).json() == first.json()
        detail = client.get("/api/examples/pose.cluster").json()
        assert detail["computed_result_available"] and detail["pin"]["job_id"] == identifier
        assert identifier not in {row["id"] for row in client.get("/api/jobs").json()}
        assert (
            client.post("/api/examples/pose.cluster/prepare").json()["request"]
            == (client.get("/api/jobs/" + identifier).json()["request"])
        )
    target = output / "x-dde-pose-cases-v1.zip"
    source_revision = os.environ["GITHUB_SHA"]
    summary = export_bundle(settings, target, source_revision, capabilities=CAPABILITIES)
    with target.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    cold = replace(settings, state_dir=output / "cold-case-state")
    before = Store(cold.state_dir / "jobs.sqlite3")
    # A cold import must restore the complete parent, native frames, and original poses.
    first_restore = restore_bundle(target, cold, digest)
    rows = {
        name: None
        for name in ("jobs", "assets", "scientific_objects", "example_pins", "example_record_pins")
    }
    with before.connect() as db:
        rows = {name: [tuple(row) for row in db.execute("SELECT * FROM " + name)] for name in rows}
    assert restore_bundle(target, cold, digest) == first_restore
    with before.connect() as db:
        assert rows == {
            name: [tuple(row) for row in db.execute("SELECT * FROM " + name)] for name in rows
        }
    assert verify_examples(cold, CAPABILITIES) == {"modules": 2, "computed": 2, "validated": 0}
    try:
        verify_examples(cold, ("pose.cluster",))
    except ValueError as exc:
        assert "parent-case" in str(exc)
    else:
        raise AssertionError("An analysis cannot lose its parent-case evidence")
    with TestClient(create_app(cold), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
        assert client.get("/api/examples/pose.cluster").json()["computed_result_available"]
        assert client.get("/api/jobs").json() == []
        for name, expected in result["artifacts"].items():
            response = client.get("/api/jobs/" + identifier + "/download", params={"name": name})
            assert (
                response.status_code == 200
                and hashlib.sha256(response.content).hexdigest() == expected
            )
    receipt = {
        "file": target.name,
        "bytes": target.stat().st_size,
        "sha256": digest,
        "source_revision": source_revision,
        "capabilities": list(CAPABILITIES),
        "native_job_id": identifier,
        "summary": summary,
        "cold_restore": True,
        "repeat_restore_identical": True,
        "parent_required": True,
        "personal_jobs_added": 0,
        "scientific_scope": "native_geometry_and_contacts_not_experimental_binding",
    }
    (output / "native-example-archive.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))
