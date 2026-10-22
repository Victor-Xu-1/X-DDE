"""A DEL archive update does not request unrelated native or deployment checks."""

import runpy
import unittest
from pathlib import Path

SCOPE = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts/del-case-scope.py"))


class DELCaseScopeTests(unittest.TestCase):
    def test_current_release_metadata_and_direct_consumers(self):
        self.assertTrue(SCOPE["selected"](SCOPE["PATHS"]))
        self.assertTrue(SCOPE["selected"]([SCOPE["SOURCE"]]))

    def test_core_restore_changes_retain_their_existing_checks(self):
        for path in (
            "src/opendde_workbench/examples/bundle_restore.py",
            "src/opendde_workbench/examples/bundle_archive.py",
            "src/opendde_workbench/deployment/installers.py",
            "tests/test_case_bundle.py",
            "frontend/src/deployment/DeploymentPanel.tsx",
        ):
            with self.subTest(path=path):
                self.assertFalse(SCOPE["selected"]([SCOPE["SOURCE"], path]))

    def test_other_cohorts_and_scientific_programs_are_not_narrowed(self):
        for path in (
            "src/opendde_workbench/examples/stat6_bundle_release.py",
            "src/opendde_workbench/datasets/native/series.py",
            "src/opendde_workbench/settings.py",
        ):
            with self.subTest(path=path):
                self.assertFalse(SCOPE["selected"]([SCOPE["SOURCE"], path]))

    def test_no_release_source_does_not_select_a_data_only_batch(self):
        for paths in (
            [],
            ["docs/design/screening-and-del.md"],
            ["tests/test_del_case_component.py"],
        ):
            with self.subTest(paths=paths):
                self.assertFalse(SCOPE["selected"](paths))


if __name__ == "__main__":
    unittest.main()
