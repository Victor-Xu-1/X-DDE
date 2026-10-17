"""Restore the canonical real STAT6 archive in CI without scientific execution."""

import hashlib
import os
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

from opendde_workbench.examples import stat6_bundle_release as spec
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.settings import Settings


def download_archive(destination):
    """Every current-data consumer uses the canonical immutable release authority."""
    source = urlsplit(spec.URL)
    parts = source.path.split("/")
    assert source.scheme == "https" and source.hostname == "github.com"
    assert parts[1:5] == ["Victor-Xu-1", "X-DDE", "releases", "download"]
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / parts[-1]
    if not archive.exists():
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
    assert archive.stat().st_size == spec.BYTES
    with archive.open("rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == spec.SHA256
    return archive


def main():
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    archive = download_archive(Path("outputs/quality-context/source"))
    print(restore_bundle(archive, settings, spec.SHA256))


if __name__ == "__main__":
    main()
