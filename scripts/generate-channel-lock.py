"""Metadata-only regeneration of the independent native channel dependency lock."""

import argparse
from pathlib import Path

from native_lock import write_lock


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    write_lock(Path(__file__).resolve().parents[1] / "src/opendde_workbench/space", args.check)


if __name__ == "__main__":
    main()
