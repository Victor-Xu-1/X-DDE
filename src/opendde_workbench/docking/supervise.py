"""Host wrapper in the existing supervised process group; no queue or provider client."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-gnina-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
        raise ValueError("Docking result manifest is invalid or oversized.")
    result = json.loads(file.read_text())
    if result.get("operation") != "docking" or result.get("complete") is not True:
        raise ValueError("GNINA did not provide a completed normalized result.")


if __name__ == "__main__":
    main()
