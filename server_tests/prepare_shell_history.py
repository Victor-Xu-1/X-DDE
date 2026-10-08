"""Restore one searchable historical task from verified native case bytes in CI only."""

import hashlib
import json
import os
import shutil
from pathlib import Path

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.models import Status
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store


def main():
    settings = Settings.from_env()
    assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
    store = Store(settings.state_dir / "jobs.sqlite3")
    pin = ExamplePins(store, settings.state_dir).get("esm", verify=True)
    assert pin is not None
    original = store.get(str(pin.job_id))
    assert original is not None and original.status == Status.SUCCEEDED
    request = original.request.model_copy(
        update={"name": "Trastuzumab sequence scoring · archived research", "project_id": None}
    )
    restored = store.create(
        request, "shell-history-" + str(pin.job_id), 2, 1000, parent_id=original.id
    )
    assert store.claim(expected_id=restored.id) is not None
    source = settings.state_dir / "jobs" / original.id
    target = settings.state_dir / "jobs" / restored.id
    shutil.copytree(source, target)
    for name, expected in pin.artifact_sha256.items():
        assert hashlib.sha256((target / "output" / name).read_bytes()).hexdigest() == expected
    store.finish(restored.id, Status.SUCCEEDED)
    evidence = Path("server_tests/evidence/navigation-shell")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "searchable-native-history.json").write_text(
        json.dumps(
            {
                "job_id": restored.id,
                "source_job_id": original.id,
                "artifact_sha256": pin.artifact_sha256,
                "scientific_inference": False,
            },
            indent=2,
        )
    )
    print("Restored one searchable historical task from unchanged native outputs; no inference")


if __name__ == "__main__":
    main()
