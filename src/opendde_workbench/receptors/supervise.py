"""Native exit and exact receptor evidence are checked before shared task success."""

import json
import sys
from pathlib import Path

from opendde_workbench.container_supervision import attach
from opendde_workbench.receptors.contract import ReceptorEnsembleTask
from opendde_workbench.receptors.result import validate_result


def main():
    directory = Path(sys.argv[1]).resolve()
    attach(directory, "xdde-biopython-")
    file = directory / "output/result.json"
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Receptor alignment result is unsafe or oversized.")
    request = ReceptorEnsembleTask.model_validate_json((directory / "request.json").read_text())
    validate_result(json.loads(file.read_text()), request, directory / "output")


if __name__ == "__main__":
    main()
