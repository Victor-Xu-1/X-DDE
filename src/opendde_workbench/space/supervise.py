"""Success requires native exit and independently validated scientific evidence."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.space.result import validate_channels


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-caver-")
    file = directory / "output/result.json"
    if file.is_symlink() or not 0 < file.stat().st_size <= 20 * 1024**2:
        raise ValueError("The native channel result is unsafe or oversized.")
    request = TASK_ADAPTER.validate_json((directory / "request.json").read_text())
    if request.operation != "channel_analysis":
        raise ValueError("Unsupported operation in the native channel supervisor.")
    validate_channels(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
