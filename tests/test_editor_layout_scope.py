"""Unrelated admission/backend/form edits must never use editor-only delegation."""

import runpy
from pathlib import Path

import pytest

M = runpy.run_path("scripts/editor-layout-scope.py")


@pytest.mark.parametrize("path", [
    "src/opendde_workbench/api.py", "frontend/src/guided/useTaskReadiness.ts",
    "frontend/src/guided/Questionnaire.tsx", "frontend/src/operations/PropertyForm.tsx",
    "frontend/src/editors/future-engine.ts",
])
def test_unrelated_or_future_contracts_do_not_delegate(path):
    assert not M["selected"](M["SOURCES"] | {path})


def test_bounded_editor_and_publication_changes_delegate_but_dispatch_or_version_only_do_not():
    assert M["selected"](M["FILES"])
    assert not M["selected"](["pyproject.toml"])
    assert not M["selected"](M["FILES"], "workflow_dispatch")


def test_delegation_keeps_native_editor_and_aligned_action_checks_required():
    workflow = Path(".github/workflows/task-readiness-checks.yml").read_text()
    assert "editor_layout_only: ${{ steps.editor.outputs.editor_layout_only }}" in workflow
    assert "needs.managed-compute-scope.outputs.editor_layout_only != 'true'" in workflow
    matrix = Path(".github/workflows/task-layout-checks.yml").read_text()
    assert "editor_layout_only: ${{ steps.scope.outputs.editor_layout_only }}" in matrix
    assert "needs.editor-scope.outputs.editor_layout_only != 'true'" in matrix
    display = Path(".github/workflows/ketcher-depiction-checks.yml").read_text()
    for name in ("AlignedEditAction*", "EditorCommands*", "editors.css", "test_editor_workspace_layout_browser.py"):
        assert name in display
    assert "src/editors/AlignedEditAction.test.tsx" in display
