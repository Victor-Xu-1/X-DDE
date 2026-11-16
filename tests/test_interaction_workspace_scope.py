import runpy

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
])
def test_shared_and_scientific_changes_keep_their_own_checks(path):
    assert not scope["selected"]([*scope["SOURCES"], path])
