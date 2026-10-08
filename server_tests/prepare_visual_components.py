"""Install only the reviewed native 2D editor into isolated CI state; no science jobs."""

import argparse
import os
from pathlib import Path

from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.settings import Settings

settings = Settings.from_env()
parser = argparse.ArgumentParser()
parser.add_argument(
    "--components",
    nargs="+",
    choices=("ketcher", "public-dataset-examples", "public-pose-examples"),
    default=("ketcher", "public-dataset-examples"),
)
requested = parser.parse_args().components
runner = Path(os.environ["RUNNER_TEMP"]).resolve()
assert settings.state_dir.resolve().is_relative_to(runner)
manager = DeploymentManager(settings.state_dir)
if not manager.store.config():
    manager.configure(str(runner / "x-dde-visual-components"), False)
assert Path(manager.store.config()["root"]).resolve().is_relative_to(runner)
for component in requested:
    if component in manager.store.installed():
        continue
    assert not any(row["state"] in {"queued", "running", "pausing"} for row in manager.store.rows())
    operation = manager.enqueue(component, "install")[0]
    manager.tick()
    assert manager.store.get(operation)["state"] == "succeeded", manager.store.get(operation)
if "ketcher" in requested:
    assert (Path(manager.store.installed()["ketcher"]["web"]) / "index.html").is_file()
for component, count in (("public-dataset-examples", 14), ("public-pose-examples", 2)):
    if component in requested:
        assert manager.store.installed()[component]["computed"] == count
print("Reviewed graphical components are ready: " + ", ".join(requested))
