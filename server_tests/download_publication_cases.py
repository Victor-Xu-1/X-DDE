"""Obtain the already accepted release cases through their single canonical policy."""

import runpy
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

from opendde_workbench.examples import channel_bundle_release, pose_bundle_release


def main():
    verify_bundle = runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "scripts/stage-release-examples.py")
    )["verify_bundle"]
    destination = Path("outputs/retained-publication")
    destination.mkdir(parents=True, exist_ok=True)
    for spec in (pose_bundle_release, channel_bundle_release):
        source = urlsplit(spec.URL)
        parts = source.path.split("/")
        if (
            source.scheme != "https"
            or source.hostname != "github.com"
            or parts[1:5] != ["Victor-Xu-1", "X-DDE", "releases", "download"]
        ):
            raise ValueError("The accepted case URL is outside its canonical release source.")
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
