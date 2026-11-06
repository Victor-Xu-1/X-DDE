"""Block an incompatible application change without installing or rewriting anything."""

import argparse
import json
import subprocess
from pathlib import Path

from opendde_workbench.drafts.compatibility import check_draft_compatibility


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--temporary-directory", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = check_draft_compatibility(
            args.database, args.wheel, args.sha256, args.temporary_directory
        )
    except (OSError, TypeError, ValueError, subprocess.SubprocessError) as error:
        # Exit nonzero on inability to prove compatibility, without printing source data.
        print(json.dumps({"compatible": False, "reason": type(error).__name__}))
        return 2
    print(json.dumps(result))
    return 0 if result["compatible"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
