import runpy
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/admet-workspace-scope.py")


def test_exact_admet_sources_and_publication_companions():
    assert scope["selected"](scope["FILES"])
    for path in scope["SOURCES"]:
        assert scope["selected"]([path])
    assert not scope["selected"]([])
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")


@pytest.mark.parametrize("path", [
    "frontend/src/App.tsx", "frontend/src/viewer/PoseSession.tsx",
    "frontend/src/viewer/StructureViewport.tsx", "frontend/src/presentation/ResearchTable.tsx",
    "frontend/src/admet/AdmetForm.tsx", "src/opendde_workbench/admet/runner.py",
    "frontend/src/admet/AdmetResultsBackup.tsx",
])
def test_shared_forms_and_scientific_changes_keep_their_existing_checks(path):
    assert not scope["selected"]([*scope["SOURCES"], path])


def test_unrelated_native_and_layout_jobs_delegate_without_starting_science():
    checks = {
        "structure-layout-checks.yml": ("view-alignment", "adjacent-result-consumers"),
        "pose-handoff-checks.yml": ("pose-continuity",),
        "restraint-guidance-checks.yml": ("frontend-guidance",),
    }
    for file, jobs in checks.items():
        text = (Path(".github/workflows") / file).read_text()
        for job in jobs:
            body = text.split("  " + job + ":", 1)[1].split("    steps:", 1)[0]
            assert ".outputs.admet_result_only != 'true'" in body
