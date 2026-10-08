"""Reuse checksum-bound retained native cases in an isolated CI state; never compute."""

import os
from pathlib import Path

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.settings import Settings

settings = Settings.from_env()
assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
for path, digest in (
    (
        "outputs/retained-cluster/x-dde-pose-cases-v1.zip",
        "0f5a67032ca936974a2eacc9c084c805a3147afa98d5ea3c7aa1015dc1c5d54c",
    ),
    (
        "outputs/retained-channels/platform/x-dde-channel-cases-v1.zip",
        "b874e0ec116dda343a7b310edbf7923b7eeb5f432ab9c7d3dd49ba6d58bf82c7",
    ),
):
    print(restore_bundle(Path(path), settings, digest))
