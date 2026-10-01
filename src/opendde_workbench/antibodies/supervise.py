"""Actual owned container exit and typed source evidence are required before task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.antibodies.result import validate_numbering
from opendde_workbench.container_supervision import attach
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-anarcii-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Antibody report is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    if request.operation != "antibody_number":
        raise ValueError("Unsupported antibody operation.")
    validate_numbering(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
