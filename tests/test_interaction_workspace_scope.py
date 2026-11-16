import runpy
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/interaction-workspace-scope.py")


def test_exact_result_paths_and_publication_companions():
    assert scope["selected"](scope["FILES"])
    for source in scope["SOURCES"]:
        assert scope["selected"]([source])
    assert not scope["selected"](
        ["pyproject.toml", ".github/workflows/structure-layout-checks.yml"]
    )
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")
    assert not scope["selected"]([])


@pytest.mark.parametrize("path", [
    "frontend/src/App.tsx", "frontend/src/viewer/scene.ts",
    "frontend/src/viewer/StructureViewport.tsx", "frontend/src/presentation/ResearchTable.tsx",
    "frontend/src/integrations/ScientificResults.tsx", "src/opendde_workbench/integrations/plip.py",
    "frontend/src/integrations/InteractionResultsBackup.tsx",
    "frontend/src/integrations/ProteinInterfaceForm.tsx",
])
def test_shared_and_scientific_changes_keep_their_own_checks(path):
    assert not scope["selected"]([*scope["SOURCES"], path])


def test_both_unrelated_layout_jobs_delegate_to_the_contact_gate():
    workflow = Path(".github/workflows/structure-layout-checks.yml").read_text()
    for job in ("view-alignment", "adjacent-result-consumers"):
        body = workflow.split("  " + job + ":", 1)[1].split("    steps:", 1)[0]
        assert "needs.scope.outputs.interaction_only != 'true'" in body
    guidance = Path(".github/workflows/restraint-guidance-checks.yml").read_text()
    body = guidance.split("  frontend-guidance:", 1)[1].split("    steps:", 1)[0]
    assert "needs.scope.outputs.interaction_only != 'true'" in body
    native = Path(".github/workflows/protein-interface-checks.yml").read_text()
    body = native.split("  contracts-and-preview:", 1)[1].split("    steps:", 1)[0]
    assert "needs.native-scope.outputs.interaction_only != 'true'" in body


def test_epitope_only_changes_keep_the_native_gate_focused():
    sources = scope["EPITOPE_SOURCES"]
    assert scope["epitope_only"]([*sources, "pyproject.toml"])
    assert not scope["epitope_only"]([*sources, "frontend/src/viewer/StructureViewport.tsx"])
    assert not scope["epitope_only"]([*sources, "frontend/src/integrations/InteractionResults.tsx"])
    assert not scope["epitope_only"]([*sources], "workflow_dispatch")
    workflow = Path(".github/workflows/structure-layout-checks.yml").read_text()
    contact = workflow.split("  interaction-workspace:", 1)[1].split("  view-alignment:", 1)[0]
    assert "needs.scope.outputs.epitope_only != 'true'" in contact
    assert "needs.scope.outputs.epitope_changed == 'true'" in contact
    assert "server_tests/test_epitope_workspace_browser.py" in contact
