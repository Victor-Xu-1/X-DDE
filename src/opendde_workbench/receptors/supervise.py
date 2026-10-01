"""Native exit and exact receptor evidence are checked before shared task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.receptors.preparation_result import validate_preparation
from opendde_workbench.receptors.result import validate_result
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-biopython-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Receptor alignment result is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    value = json.loads(file.read_text())
    if request.operation == "structure_prepare":
        validate_preparation(value, request, directory / "output")
    elif request.operation == "receptor_ensemble":
        validate_result(value, request, directory / "output")
    else:
        raise ValueError("Unsupported operation in the reviewed structural supervisor.")


if __name__ == "__main__":
    main()
