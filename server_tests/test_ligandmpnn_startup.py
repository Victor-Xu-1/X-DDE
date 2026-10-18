"""Build the exact managed runtime and exercise its full CLI without inference or models."""

import json
import os
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_LIGANDMPNN_STARTUP") != "1",
    reason="hosted native installation check only; no owner test suites",
)


def test_managed_ligandmpnn_imports_sidechain_dependencies_under_the_owning_uid(tmp_path):
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.integrations.image import lock_digest
    from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest

    root = tmp_path / "components"
    root.mkdir()
    operation = str(uuid4())
    stages = []
    installed = install("ligandmpnn", root, {}, operation, stages.append, lambda: None)
    assert installed["image"].startswith("sha256:")
    assert installed["recipe_sha256"] == recipe_digest("ligandmpnn")
    assert installed["runtime_lock_sha256"] == lock_digest("ligandmpnn")
    assert "models" not in installed
    assert "Checking the installed native command entrypoint" in stages
    log = (root / "operations" / operation / "install.log").read_text()
    assert "--pack_side_chains" in log and "--checkpoint_path_sc" in log
    assert "ModuleNotFoundError" not in log and "Traceback" not in log
    evidence = Path(__file__).with_name("evidence") / "ligandmpnn-startup"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "acceptance.json").write_text(
        json.dumps(
            {
                "native_source_version": PROGRAMS["ligandmpnn"]["version"],
                "image": installed["image"],
                "recipe_sha256": installed["recipe_sha256"],
                "runtime_lock_sha256": installed["runtime_lock_sha256"],
                "installing_uid": os.getuid(),
                "native_cli_help": True,
                "model_resources_installed": False,
                "scientific_inference": False,
                "stages": stages,
            },
            indent=2,
        )
    )
    (evidence / "install.log").write_text(log)
