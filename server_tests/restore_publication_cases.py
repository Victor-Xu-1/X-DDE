"""Reuse checksum-bound retained native cases in an isolated CI state; never compute."""

import os
import shutil
from dataclasses import replace
from pathlib import Path

from opendde_workbench.examples import channel_bundle_release, pose_bundle_release
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.settings import Settings

settings = Settings.from_env()
assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
for name, path, digest in (
    (
        "pose.cluster",
        "outputs/retained-publication/x-dde-pose-cases-v1.zip",
        pose_bundle_release.SHA256,
    ),
    (
        "caver.paths",
        "outputs/retained-publication/x-dde-channel-cases-v1.zip",
        channel_bundle_release.SHA256,
    ),
):
    # These archives retain distinct immutable versions of shared public inputs.
    # Separate states preserve every earlier record; no overwrite gate is relaxed.
    state = settings.state_dir.parent / "publication-cases" / name
    print(restore_bundle(Path(path), replace(settings, state_dir=state), digest))
    shutil.copy2(settings.state_dir / "deployment.json", state / "deployment.json")
