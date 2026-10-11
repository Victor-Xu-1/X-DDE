"""Isolated history metadata plus an unchanged native pocket case; never compute."""

import hashlib
import json
import os
import shutil
from pathlib import Path
from uuid import uuid4

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.models import Status
from opendde_workbench.requests import Properties
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store


def main():
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pins = ExamplePins(store, settings.state_dir)
    pin = pins.get("p2rank.detect", verify=True)
    assert pin is not None, "The reviewed native pocket case is required"
    original = store.get(str(pin.job_id))
    assert original is not None and original.status == Status.SUCCEEDED
    clone = store.create(
        original.request.model_copy(
            update={
                "name": "BRD4 native pocket result · unchanged archived output",
                "project_id": None,
            }
        ),
        str(uuid4()),
        1000,
        2000,
        parent_id=original.id,
    )
    assert store.claim(expected_id=clone.id) is not None
    source = settings.state_dir / "jobs" / original.id
    target = settings.state_dir / "jobs" / clone.id
    shutil.copytree(source, target)
    for name, digest in pin.artifact_sha256.items():
        assert hashlib.sha256((target / "output" / name).read_bytes()).hexdigest() == digest
    store.finish(clone.id, Status.SUCCEEDED)
    records = []
    for index in range(125):
        job = store.create(
            Properties(name=f"Controlled history metadata {index:03d}", smiles=["c1ccccc1"]),
            str(uuid4()),
            1000,
            2000,
        )
        assert store.claim(expected_id=job.id) is not None
        store.finish(job.id, Status.CANCELLED)
        records.append({"id": job.id, "name": job.request.name})
    evidence = Path("server_tests/evidence/task-history")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "fixture.json").write_text(
        json.dumps(
            {
                "native_job": clone.id,
                "native_name": clone.request.name,
                "native_source_job": original.id,
                "artifact_sha256": pin.artifact_sha256,
                "controlled_metadata_records": records,
                "scientific_inference": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        "Restored unchanged native pocket outputs and 125 cancelled transport records; no inference"
    )


if __name__ == "__main__":
    main()
