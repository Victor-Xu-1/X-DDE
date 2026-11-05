"""Closed UI scope must not suppress unrelated native or form checks."""

import runpy

import pytest

SCOPE = runpy.run_path("scripts/calculation-plan-scope.py")


def test_exact_interface_and_publication_files():
    assert SCOPE["selected"](SCOPE["FILES"])


def test_browser_only_edit_keeps_its_dedicated_gate():
    assert SCOPE["selected"](["server_tests/test_calculation_plan_browser.py"])


@pytest.mark.parametrize(
    "path",
    [
        "src/opendde_workbench/integrations/options.py",
        "src/opendde_workbench/integrations/runtime.py",
        "frontend/src/integrations/ScientificForm.tsx",
        "frontend/src/integrations/ScientificResults.tsx",
        "frontend/src/integrations/validation.ts",
        "frontend/src/integrations/ScientificChoicesUnrelated.tsx",
        "frontend/src/styles.css",
    ],
)
def test_mixed_native_and_other_interface_changes_use_existing_checks(path):
    assert not SCOPE["selected"]([*SCOPE["SOURCES"], path])


def test_no_source_or_explicit_dispatch_never_skips():
    assert not SCOPE["selected"](["pyproject.toml"])
    assert not SCOPE["selected"](SCOPE["FILES"], "workflow_dispatch")
