"""Freeze the real channel task; restore via the existing bundle and asset authorities."""

import hashlib
import json
import os
from dataclasses import replace

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.store import Store


def freeze_channels(settings, output, identifier, result):
    capabilities = ("caver.paths",)
    target = output / "x-dde-channel-cases-v1.zip"
    revision = os.environ["GITHUB_SHA"]
    summary = export_bundle(settings, target, revision, capabilities=capabilities)
    with target.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    cold = replace(settings, state_dir=output / "cold-case-state")
    first = restore_bundle(target, cold, digest)
    store = Store(cold.state_dir / "jobs.sqlite3")
    tables = ("jobs", "assets", "scientific_objects", "example_pins")
    with store.connect() as db:
        before = {t: [tuple(v) for v in db.execute("SELECT * FROM " + t)] for t in tables}
    assert restore_bundle(target, cold, digest) == first
    with store.connect() as db:
        assert before == {t: [tuple(v) for v in db.execute("SELECT * FROM " + t)] for t in tables}
    assert verify_examples(cold, capabilities) == {"modules": 1, "computed": 1, "validated": 0}
    with TestClient(create_app(cold), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
        assert client.get("/api/jobs").json() == []
        detail = client.get("/api/examples/caver.paths").json()
        assert detail["computed_result_available"] and detail["pin"]["job_id"] == identifier
    receipt = {
        "file": target.name,
        "bytes": target.stat().st_size,
        "sha256": digest,
        "source_revision": revision,
        "capabilities": list(capabilities),
        "native_job_id": identifier,
        "summary": summary,
        "cold_restore": True,
        "repeat_restore_identical": True,
        "personal_jobs_added": 0,
        "scientific_scope": "static_geometry_not_whole_drug_passage_or_experimental_binding",
    }
    (output / "native-example-archive.json").write_text(json.dumps(receipt, indent=2))
    return receipt
