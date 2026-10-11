"""Prepare only native Chemistry and retained STAT6 inputs in isolated CI."""

import json
import os
from pathlib import Path
from uuid import uuid4

from opendde_workbench.deployment.installers import install
from opendde_workbench.settings import Settings

settings = Settings.from_env()
assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
root = Path(os.environ["RUNNER_TEMP"]) / "pose-handoff-components"
root.mkdir(exist_ok=True)
result = install(
    "chemistry", root, {}, str(uuid4()), lambda line: print(line, flush=True), lambda: None
)
with Path(os.environ["GITHUB_ENV"]).open("a") as stream:
    stream.write("WB_CHEMISTRY_IMAGE=" + result["image"] + "\n")
output = Path("outputs/pose-handoff")
output.mkdir(parents=True, exist_ok=True)
(output / "runtime.json").write_text(
    json.dumps({"image": result["image"], "scope": "Chemistry only"}, indent=2)
)
