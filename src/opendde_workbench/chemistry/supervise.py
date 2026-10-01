"""Native exit and exact state evidence are checked before shared task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.chemistry.contract import MolecularStatesTask
from opendde_workbench.chemistry.result import validate_result
from opendde_workbench.container_supervision import attach


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-chemistry-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("Chemical preparation result is unsafe or oversized.")
    request = MolecularStatesTask.model_validate_json((directory / "request.json").read_text())
    validate_result(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
