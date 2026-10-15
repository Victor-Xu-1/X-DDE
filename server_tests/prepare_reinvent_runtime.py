"""CI-only managed installation of the exact REINVENT runtime and official priors."""

import json
import os
from pathlib import Path

from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.settings import Settings

runner = Path(os.environ["RUNNER_TEMP"]).resolve()
settings = Settings.from_env()
assert settings.state_dir.resolve().is_relative_to(runner)
manager = DeploymentManager(settings.state_dir)
assert manager.store.config(), "Prepare the managed graphical component first."
root = Path(manager.store.config()["root"])
assert root.resolve().is_relative_to(runner)
assert not any(
    row["state"] in {"queued", "running", "paused", "pausing"} for row in manager.store.rows()
)
operations = manager.enqueue("reinvent-models", "install")
try:
    for _ in operations:
        manager.tick()
    for operation in operations:
        assert manager.store.get(operation)["state"] == "succeeded", manager.store.get(operation)
except Exception:
    for operation in operations:
        log = root / "operations" / operation / "install.log"
        if log.is_file():
            print(log.read_text(errors="replace")[-16000:])
    raise
installed = manager.store.installed()
assert {"reinvent", "reinvent-models", "ketcher"} <= installed.keys()
evidence = Path("outputs/reinvent-native")
evidence.mkdir(parents=True, exist_ok=True)
(evidence / "managed-installation.json").write_text(
    json.dumps(
        {
            "revision": os.environ["GITHUB_SHA"],
            "operations": [manager.store.get(row) for row in operations],
            "runtime": installed["reinvent"],
            "models": installed["reinvent-models"],
        },
        indent=2,
    ),
    encoding="utf-8",
)
print("Managed REINVENT runtime, native offline CLI and official priors installed.")
