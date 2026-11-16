"""Restore the sealed public contact example through the existing result authority."""

import os
from pathlib import Path

import pytest

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.stat6_bundle_release import SHA256
from opendde_workbench.settings import Settings


@pytest.fixture(name="interaction_workspace", scope="module")
def retained_contact_workspace(tmp_path_factory):
    root = tmp_path_factory.mktemp("interaction-workspace")
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("WB_HOME", str(root))
        patch.setenv("WB_STATE_DIR", str(root / "state"))
        settings = Settings.from_env()
        restored = restore_bundle(Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, SHA256)
        assert restored["computed"] > 0
        yield settings
