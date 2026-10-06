"""Install only the reviewed native 2D editor into isolated CI state; no science jobs."""

import os
from pathlib import Path

from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.settings import Settings

settings = Settings.from_env()
runner = Path(os.environ["RUNNER_TEMP"]).resolve()
assert settings.state_dir.resolve().is_relative_to(runner)
manager = DeploymentManager(settings.state_dir)
if not manager.store.config():
    manager.configure(str(runner / "x-dde-visual-components"), False)
assert Path(manager.store.config()["root"]).resolve().is_relative_to(runner)
if "ketcher" not in manager.store.installed():
    assert not any(row["state"] in {"queued", "running", "pausing"} for row in manager.store.rows())
    manager.enqueue("ketcher", "install")
    manager.tick()
    operations = [row for row in manager.store.rows() if row["package"] == "ketcher"]
    assert operations and operations[0]["state"] == "succeeded", operations
assert (Path(manager.store.installed()["ketcher"]["web"]) / "index.html").is_file()
if "public-dataset-examples" not in manager.store.installed():
    operation = manager.enqueue("public-dataset-examples", "install")[0]
    manager.tick()
    assert manager.store.get(operation)["state"] == "succeeded", manager.store.get(operation)
assert manager.store.installed()["public-dataset-examples"]["computed"] == 14
print("Reviewed native Ketcher is ready for graphical browser checks.")
