"""Stage an accepted case-data artifact into the existing software release only."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

from opendde_workbench.examples import surface_bundle_release as spec


def verify_bundle(file):
    if file.stat().st_size != spec.BYTES:
        raise ValueError("Accepted example archive size changed.")
    with file.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != spec.SHA256:
            raise ValueError("Accepted example archive digest changed.")
    with zipfile.ZipFile(file) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    if manifest.get("source_revision") != spec.SOURCE_REVISION or manifest.get("capabilities") != [
        "biopython.exposure"
    ]:
        raise ValueError("The artifact does not match the approved native source and case scope.")
    if manifest.get("notices", {}).get("licenses") != ["CC0-1.0"]:
        raise ValueError("The exposure source notices differ from the reviewed case data.")
    return manifest


def stage(tag, destination):
    parts = urlsplit(spec.URL).path.split("/")
    if parts[-2] != tag:
        # Later software versions reuse this immutable data URL; do not republish it.
        return
    repository = os.environ["GITHUB_REPOSITORY"]
    if repository != "Victor-Xu-1/X-DDE":
        raise ValueError("The official case archive is staged only by its owning repository.")
    run = json.loads(
        subprocess.check_output(
            ["gh", "api", f"repos/{repository}/actions/runs/{spec.NATIVE_RUN_ID}"], text=True
        )
    )
    if (
        run.get("conclusion") != "success"
        or run.get("status") != "completed"
        or run.get("head_sha") != spec.SOURCE_REVISION
        or run.get("path") != ".github/workflows/surface-exposure-checks.yml"
    ):
        raise ValueError("The native source run did not pass the reviewed scoped acceptance.")
    with tempfile.TemporaryDirectory(
        prefix="accepted-surface-", dir=os.environ["RUNNER_TEMP"]
    ) as directory:
        subprocess.run(
            [
                "gh",
                "run",
                "download",
                str(spec.NATIVE_RUN_ID),
                "--repo",
                repository,
                "--name",
                "surface-exposure-native-evidence",
                "--dir",
                directory,
            ],
            check=True,
        )
        source = Path(directory) / parts[-1]
        verify_bundle(source)
        destination.mkdir(parents=True, exist_ok=True)
        target = destination / source.name
        if target.exists():
            verify_bundle(target)
        else:
            shutil.copyfile(source, target)
    print(
        json.dumps({"case": target.name, "sha256": spec.SHA256, "native_run": spec.NATIVE_RUN_ID})
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    stage(args.tag, args.destination)


if __name__ == "__main__":
    main()
