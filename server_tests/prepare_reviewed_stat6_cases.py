"""Restore the exact current native STAT6 archive into fresh hosted CI state only."""

import os
import sys
from pathlib import Path

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.settings import Settings

settings = Settings.from_env()
assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
assert not (settings.state_dir / "jobs.sqlite3").exists(), "Use fresh isolated CI state."
print(restore_bundle(Path(sys.argv[1]), settings, SHA256))
