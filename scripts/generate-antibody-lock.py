"""Metadata-only regeneration of the independently reviewed CPU antibody lock."""

import argparse
from pathlib import Path

from native_lock import write_lock


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    write_lock(Path(__file__).resolve().parents[1] / "src/opendde_workbench/antibodies", args.check)


if __name__ == "__main__":
    main()
