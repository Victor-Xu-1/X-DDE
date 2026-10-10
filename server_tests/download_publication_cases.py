"""Obtain accepted native release cases through their canonical checksum policy."""

import argparse
import runpy
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

from opendde_workbench.examples import (
    channel_bundle_release,
    pose_bundle_release,
    proximity_bundle_release,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annotations", action="store_true")
    args = parser.parse_args()
    verify_bundle = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/stage-release-examples.py")
    )["verify_bundle"]
    destination = Path("outputs/retained-publication")
    destination.mkdir(parents=True, exist_ok=True)
    cases = [pose_bundle_release, channel_bundle_release]
    if args.annotations:
        cases.append(proximity_bundle_release)
    for spec in cases:
        source = urlsplit(spec.URL)
        parts = source.path.split("/")
        if (
            source.scheme != "https"
            or source.hostname != "github.com"
            or parts[1:5] != ["Victor-Xu-1", "X-DDE", "releases", "download"]
        ):
            raise ValueError("Case URL is outside the canonical release source.")
        path = destination / parts[-1]
        if not path.exists():
            subprocess.run(
                [
                    "gh",
                    "release",
                    "download",
                    parts[-2],
                    "--repo",
                    "Victor-Xu-1/X-DDE",
                    "--pattern",
                    parts[-1],
                    "--dir",
                    str(destination),
                ],
                check=True,
                timeout=120,
            )
        verify_bundle(path, spec)
        print(f"Accepted immutable case verified: {path.name} {spec.SHA256}")


if __name__ == "__main__":
    main()
