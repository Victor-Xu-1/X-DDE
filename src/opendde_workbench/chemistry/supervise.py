"""Native exit and exact state evidence are checked before shared task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.chemistry.cluster_result import validate_cluster
from opendde_workbench.chemistry.minimization_result import validate_minimization
from opendde_workbench.chemistry.result import validate_result
from opendde_workbench.chemistry.screen_result import validate_screen
from opendde_workbench.container_supervision import attach
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-chemistry-")
    file = directory / "output/result.json"
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    limit = (8 if request.operation == "pose_cluster" else 2) * 1024**2
    if file.is_symlink() or file.stat().st_size > limit:
        raise ValueError("Chemical preparation result is unsafe or oversized.")
    value = json.loads(file.read_text())
    if request.operation == "pose_cluster":
        validate_cluster(value, request, directory / "output")
    elif request.operation == "library_screen":
        validate_screen(value, request, directory / "output")
    elif request.operation == "molecular_states":
        validate_result(value, request, directory / "output")
    elif request.operation == "molecule_minimize":
        validate_minimization(value, request, directory / "output")
    else:
        raise ValueError("Unsupported operation in the reviewed chemical supervisor.")


if __name__ == "__main__":
    main()
