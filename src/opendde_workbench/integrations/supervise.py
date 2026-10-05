"""Confirm native exit and actual artifact identities before a task can succeed."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.integrations.result import validate_result
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    attach(directory, "xdde-" + request.payload.kind + "-")
    file = directory / "output/result.json"
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 4 * 1024**2:
        raise ValueError("Native scientific report is missing, unsafe or oversized.")
    validate_result(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
