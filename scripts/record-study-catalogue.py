"""Record the current authored STAT6 catalogue without changing historical snapshots."""

import argparse
import json
from pathlib import Path

from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.catalogue_profiles import historical_study_catalogue
from opendde_workbench.examples.stat6.catalogue import MANIFEST, MODULES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / (
        "src/opendde_workbench/examples/stat6/catalogue-profiles.json"
    )
    profiles = json.loads(path.read_text(encoding="utf-8"))
    current = bundle_catalogue("stat6").digest
    if current not in profiles:
        if args.check:
            raise SystemExit("The current authored study catalogue has no reviewed snapshot.")
        profiles[current] = {
            "file_keys": list(MANIFEST["files"]),
            "module_ids": list(MODULES),
        }
        path.write_text(
            json.dumps(profiles, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
    actual = historical_study_catalogue(current)
    if set(actual.modules) != set(MODULES):
        raise SystemExit("The current snapshot does not cover the authored modules.")
    print(current)


if __name__ == "__main__":
    main()
