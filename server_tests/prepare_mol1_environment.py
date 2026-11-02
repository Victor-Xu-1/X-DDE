"""Install the real reviewed Mol-1 profile in isolated hosted CI, never owner state."""

import json
import os
from pathlib import Path

from opendde_workbench.deployment.manager import DeploymentManager


def main():
    if os.environ.get("CI") != "true":
        raise RuntimeError("This native installation belongs to isolated CI.")
    root = Path(os.environ["WB_MOL1_CASE"]).resolve()
    if not root.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve()):
        raise RuntimeError("Native acceptance must use the isolated runner workspace.")
    root.mkdir(parents=True, exist_ok=True)
    manager = DeploymentManager(root / "state")
    manager.configure(str(root / "components"), False)
    for identifier in ("mol1-models", "molstar"):
        operations = manager.enqueue(identifier, "install")
        for _ in operations:
            manager.tick()
        for operation in operations:
            row = manager.store.get(operation)
            if row["state"] != "succeeded":
                for file in (root / "components").rglob("install.log"):
                    print(file.read_text(errors="replace")[-12000:])
                raise RuntimeError(f"Native component installation failed: {identifier}: {row}")
    (root / "installation.json").write_text(json.dumps(manager.store.installed(), indent=2))
    print("Real Mol-1 environment, model hashes and molecular viewer prepared.")


if __name__ == "__main__":
    main()
