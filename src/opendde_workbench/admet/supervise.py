"""Require actual native exit and independently validated evidence before task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.admet.result import validate_admet
from opendde_workbench.container_supervision import attach
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-admet-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("The native prediction report is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    if request.operation != "admet_predict":
        raise ValueError("Unsupported molecular prediction task.")
    validate_admet(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
