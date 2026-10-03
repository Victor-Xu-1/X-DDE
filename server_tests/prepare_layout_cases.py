"""Restore the reviewed native case bundle into an isolated CI state; never compute."""
import os
import sys
from pathlib import Path
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.bundle_release import SHA256
from opendde_workbench.settings import Settings

settings=Settings.from_env()
assert settings.state_dir.is_relative_to(Path(os.environ["RUNNER_TEMP"]))
assert not (settings.state_dir/"jobs.sqlite3").exists(), "Use a fresh isolated state"
print(restore_bundle(Path(sys.argv[1]),settings,SHA256))
