"""Native exit and exact state evidence are checked before shared task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.chemistry.result import validate_result
from opendde_workbench.chemistry.screen_result import validate_screen
from opendde_workbench.container_supervision import attach
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-chemistry-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("Chemical preparation result is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    value = json.loads(file.read_text())
    if request.operation == "library_screen":
        validate_screen(value, request, directory / "output")
    elif request.operation == "molecular_states":
        validate_result(value, request, directory / "output")
    else:
        raise ValueError("Unsupported operation in the reviewed chemical supervisor.")


if __name__ == "__main__":
    main()
