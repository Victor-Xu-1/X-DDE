"""Exact delegation, without suppressing checks for unrelated science or shared UI."""

import runpy
import unittest
from pathlib import Path

scope = runpy.run_path(
    str(Path(__file__).resolve().parents[2] / "scripts/docking-refinement-scope.py")
)


class Scope(unittest.TestCase):
    def test_exact_native_pair_batch_uses_docking_direct_consumers(self):
        self.assertTrue(scope["selected"](scope["FILES"]))

    def test_empty_or_generic_shared_output_change_is_not_enough(self):
        self.assertFalse(scope["selected"]([]))
        self.assertFalse(scope["selected"](["src/opendde_workbench/research/outputs.py"]))

    def test_unrelated_backend_ui_assets_and_archive_work_retain_their_own_gates(self):
        for path in (
            "src/opendde_workbench/assets.py",
            "frontend/src/viewer/StructureViewer.tsx",
            "src/opendde_workbench/examples/stat6_bundle_release.py",
            "AGENTS.md",
            "src/opendde_workbench/simulations/native.py",
            "src/opendde_workbench/docking/options.py",
        ):
            self.assertFalse(scope["selected"]([*scope["FILES"], path]), path)


if __name__ == "__main__":
    unittest.main()
