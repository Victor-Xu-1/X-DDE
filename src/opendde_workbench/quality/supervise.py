"""Native exit and independent typed evidence are mandatory before platform task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.quality.result import validate_quality
from opendde_workbench.requests import TASK_ADAPTER


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-posebusters-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("Quality report is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    if request.operation != "pose_quality":
        raise ValueError("Unsupported quality task.")
    validate_quality(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
