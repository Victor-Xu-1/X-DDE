"""Successful native exit and independent report/source checks precede task completion."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.humanization.result import validate_humanization
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-sapiens-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("The native sequence evaluation report is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    if request.operation != "antibody_humanize":
        raise ValueError("Unsupported sequence-evaluation task.")
    validate_humanization(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
