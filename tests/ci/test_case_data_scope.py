"""Immutable case-data updates select their direct consumers, not unrelated suites."""

import runpy
import unittest
from pathlib import Path

SCOPE = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts/case-data-scope.py"))


class CaseDataScopeTests(unittest.TestCase):
    def test_current_release_metadata_and_direct_consumers(self):
        self.assertTrue(SCOPE["selected"](SCOPE["PATHS"]))
        for source in SCOPE["SOURCES"]:
            self.assertTrue(SCOPE["selected"]([source]))

    def test_case_revision_metadata_keeps_direct_archive_checks(self):
        self.assertTrue(SCOPE["selected"]([
            "src/opendde_workbench/examples/stat6_bundle_release.py",
            "src/opendde_workbench/examples/stat6/module-revisions.json",
            "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
            "tests/test_stat6_source_revisions.py",
        ]))
        self.assertFalse(SCOPE["selected"]([
            "src/opendde_workbench/examples/stat6_bundle_release.py",
            "src/opendde_workbench/examples/stat6/catalogue.py",
        ]))
    def test_core_restore_changes_retain_their_existing_checks(self):
        for path in (
            "src/opendde_workbench/examples/bundle_restore.py",
            "src/opendde_workbench/examples/bundle_archive.py",
            "src/opendde_workbench/deployment/installers.py",
            "tests/test_case_bundle.py",
            "frontend/src/deployment/DeploymentPanel.tsx",
        ):
            with self.subTest(path=path):
                self.assertFalse(SCOPE["selected"]([*SCOPE["SOURCES"], path]))

    def test_other_cohorts_and_scientific_programs_are_not_narrowed(self):
        for path in (
            "src/opendde_workbench/examples/surface_bundle_release.py",
            "src/opendde_workbench/datasets/native/series.py",
            "src/opendde_workbench/settings.py",
        ):
            with self.subTest(path=path):
                self.assertFalse(SCOPE["selected"]([*SCOPE["SOURCES"], path]))

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
