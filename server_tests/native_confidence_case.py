"""Isolate one sealed native STAT6 result without executing or promoting it."""

import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

from opendde_workbench.examples.stat6_bundle_release import BYTES, SHA256
from opendde_workbench.store import Store


def native_case(state, archive):
    archive = Path(archive)
    assert archive.stat().st_size == BYTES
    with archive.open("rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == SHA256
    with ZipFile(archive) as source:
        manifest = json.loads(source.read("manifest.json"))
        pin = max(
            (
                row
                for row in manifest["records"]["example_pins"]
                if row["capability_id"] == "predict"
            ),
            key=lambda row: row["revision"],
        )
        identifier = pin["job_id"]
        job = next(row for row in manifest["records"]["jobs"] if row["id"] == identifier)
        assert job["status"] == "succeeded" and json.loads(job["request"])["operation"] == "predict"
        store = Store(state / "jobs.sqlite3")
        with store.connect() as db:
            columns = set(row["name"] for row in db.execute("PRAGMA table_info(jobs)"))
            assert columns == set(job)
            db.execute(
                "INSERT INTO jobs ("
                + ",".join(job)
                + ") VALUES ("
                + ",".join("?" for _ in job)
                + ")",
                list(job.values()),
            )
        prefix = f"jobs/{identifier}/"
        for name, record in manifest["files"].items():
            if not name.startswith(prefix):
                continue
            relative = Path(name)
            assert not relative.is_absolute() and ".." not in relative.parts
            assert record["bytes"] <= 8 * 1024**2
            data = source.read(name)
            assert len(data) == record["bytes"]
            assert hashlib.sha256(data).hexdigest() == record["sha256"]
            target = state / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    analysis = json.loads((state / prefix / "analysis/workbench-analysis.json").read_text())
    assert analysis["schema_version"] == 4 and analysis["candidates"]
    selected = analysis["candidates"][0]
    return identifier, selected
