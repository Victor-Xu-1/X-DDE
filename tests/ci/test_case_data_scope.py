"""Immutable case-data updates select their direct consumers, not unrelated suites."""

import runpy
import unittest
from pathlib import Path

SCOPE = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts/case-data-scope.py"))


class NativeReceptorScopeTests(unittest.TestCase):
    def test_complete_native_copy_batch_uses_direct_consumers(self):
        self.assertTrue(SCOPE["native_receptor_only"](SCOPE["RECEPTOR_PATHS"]))

    def test_unknown_science_or_restore_changes_keep_existing_gates(self):
        for path in (
            "src/opendde_workbench/examples/bundle_restore.py",
            "src/opendde_workbench/quality/native.py",
            "frontend/src/operations/HarnessForm.tsx",
        ):
            self.assertFalse(SCOPE["native_receptor_only"]([*SCOPE["RECEPTOR_PATHS"], path]))

    def test_partial_sources_and_metadata_only_changes_do_not_narrow(self):
        for paths in (
            [],
            list(SCOPE["RECEPTOR_CORE"]),
            [SCOPE["RECEPTOR_TEST"]],
            ["pyproject.toml", ".github/workflows/stat6-template-checks.yml"],
        ):
            self.assertFalse(SCOPE["native_receptor_only"](paths))

    def test_viewer_menu_change_requires_its_actual_download_browser_gate(self):
        core = [*SCOPE["RECEPTOR_CORE"], SCOPE["RECEPTOR_TEST"], "frontend/src/viewer/viewer.css"]
        browser = "server_tests/test_rgroup_reviewed_stages_browser.py"
        gate = ".github/workflows/example-result-set-checks.yml"
        self.assertFalse(SCOPE["native_receptor_only"](core))
        self.assertFalse(SCOPE["native_receptor_only"]([*core, browser]))
        self.assertFalse(SCOPE["native_receptor_only"]([*core, gate]))
        self.assertTrue(SCOPE["native_receptor_only"]([*core, browser, gate]))


class CaseDataScopeTests(unittest.TestCase):
    def test_current_release_metadata_and_direct_consumers(self):
        self.assertTrue(SCOPE["selected"](SCOPE["PATHS"]))
        for source in SCOPE["SOURCES"]:
            self.assertTrue(SCOPE["selected"]([source]))

    def test_case_revision_metadata_keeps_direct_archive_checks(self):
        self.assertTrue(
            SCOPE["selected"](
                [
                    "src/opendde_workbench/examples/stat6_bundle_release.py",
                    "src/opendde_workbench/examples/stat6/module-revisions.json",
                    "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
                    "tests/test_stat6_source_revisions.py",
                ]
            )
        )
        self.assertFalse(
            SCOPE["selected"](
                [
                    "src/opendde_workbench/examples/stat6_bundle_release.py",
                    "src/opendde_workbench/examples/stat6/catalogue.py",
                ]
            )
        )

    def test_core_restore_changes_retain_their_existing_checks(self):
        for path in (
            "src/opendde_workbench/examples/bundle_restore.py",
            "src/opendde_workbench/examples/bundle_archive.py",
            "src/opendde_workbench/deployment/installers.py",
            "scripts/antibody_template_scope.py",
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
