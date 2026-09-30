"""Attach and normalize in the existing supervised process group, no second queue."""

import subprocess
import sys
from pathlib import Path


def main():
    directory = Path(sys.argv[1]).resolve()
    from opendde_workbench.container_supervision import attach

    attach(directory, "xdde-p2rank-")
    subprocess.run(
        [sys.executable, str(Path(__file__).with_name("runner.py")), str(directory)], check=True
    )


if __name__ == "__main__":
    main()
