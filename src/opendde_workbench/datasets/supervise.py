"""Native exit, typed outputs and exact input identities gate dataset task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.datasets.result import validate_result
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-datasets-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 4 * 1024**2:
        raise ValueError("Scientific data summary is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    validate_result(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
