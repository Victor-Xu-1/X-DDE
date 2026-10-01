"""Regenerate the fixed native release lock using registry metadata only."""

import argparse
from pathlib import Path

from native_lock import write_lock


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "src/opendde_workbench/chemistry"
    write_lock(root, args.check)


if __name__ == "__main__":
    main()
