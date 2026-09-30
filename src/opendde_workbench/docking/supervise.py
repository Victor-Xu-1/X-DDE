"""Host wrapper in the existing supervised process group; no queue or provider client."""

import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.docking.result import DockingResult


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-gnina-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("Docking result manifest is invalid or oversized.")
    result = DockingResult.model_validate_json(file.read_text())
    request = DockingTask.model_validate_json((directory / "request.json").read_text())
    if (
        result.receptor != request.receptor
        or result.ligand != request.ligand
        or result.mode != request.mode
        or result.options != request.options
        or result.search != request.search
    ):
        raise ValueError("Native result does not match the exact task request.")
    output = directory / "output"
    for name in (
        result.pose_artifact,
        result.receptor_artifact,
        *(p.artifact for p in result.poses if p.valid),
    ):
        artifact = output / name
        if (
            artifact.is_symlink()
            or not artifact.is_file()
            or artifact.stat().st_size > 25 * 1024**2
        ):
            raise ValueError("Declared native output is missing, unsafe or oversized.")


if __name__ == "__main__":
    main()
