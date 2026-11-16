"""Keep scientific execution and shared-viewer changes in their original gates."""

import re
import runpy
from fnmatch import fnmatchcase
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/molecular-utility-scope.py")
GUARDS = {
    "library-screen-checks.yml": ["library-inspections"],
    "reference-input-checks.yml": ["material-inputs", "inputs"],
    "example-result-set-checks.yml": ["immutable-stages", "native-preview"],
    "admet-inspection-checks.yml": [
        "property-inspection"
    ],
    "antibody-cdr-input-checks.yml": [
        "cdr-inputs"
    ],
    "examples-checks.yml": [
        "example-contracts"
    ],
    "module-example-checks.yml": [
        "module-examples"
    ],
    "publication-checks.yml": [
        "publication"
    ],
    "research-material-checks.yml": [
        "materials"
    ],
    "simulation-questionnaire-checks.yml": [
        "questionnaires"
    ],
    "stat6-preparation-checks.yml": [
        "presets"
    ],
    "stat6-template-checks.yml": [
        "templates"
    ],
    "structure-comparison-checks.yml": [
        "contracts-and-frame"
    ],
    "structure-layout-checks.yml": [
        "view-alignment",
        "adjacent-result-consumers"
    ],
    "task-history-checks.yml": [
        "history"
    ],
    "task-readiness-checks.yml": [
        "task-inputs"
    ],
    "task-status-checks.yml": [
        "task-status"
    ],
    "pose-handoff-checks.yml": [
        "pose-continuity"
    ],
    "task-layout-checks.yml": [
        "scoped-layout"
    ],
    "restraint-guidance-checks.yml": [
        "frontend-guidance"
    ],
    "utility-tools-checks.yml": [
        "utilities"
    ],
    "pocket-result-checks.yml": [
        "pocket-results"
    ],
    "user-interface-checks.yml": [
        "presentation"
    ],
    "defined-site-checks.yml": [
        "definitions"
    ]
}


def test_exact_profile_paths_and_version_mirrors():
    assert scope["selected"](scope["FILES"])
    assert not scope["selected"]([])
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")


def test_every_independently_delegated_source_starts_the_replacement_gate():
    workflow = Path(".github/workflows/molecular-utility-checks.yml").read_text()
    push = workflow.split("  push:\n", 1)[1].split("  pull_request:\n", 1)[0]
    patterns = re.findall(r'^      - "([^"]+)"$', push, re.MULTILINE)
    assert patterns
    assert "  pull_request:\n    paths: *utility_paths" in workflow
    for path in scope["SOURCES"]:
        assert scope["selected"]([path])
        assert any(fnmatchcase(path, pattern) for pattern in patterns), path


@pytest.mark.parametrize("path", [
    "src/opendde_workbench/backend_router.py",
    "src/opendde_workbench/admet/runner.py",
    "src/opendde_workbench/admet/models.py",
    "src/opendde_workbench/chemistry/native_screen.py",
    "src/opendde_workbench/chemistry/screen_options.py",
    "frontend/src/diffsbdd/ReferencePicker.tsx",
    "frontend/src/viewer/StructureViewport.tsx", "frontend/src/App.tsx",
])
def test_mixed_runtime_and_shared_viewer_changes_are_not_delegated(path):
    assert not scope["selected"]([*scope["SOURCES"], path])


def test_heavy_jobs_delegate_to_the_exact_utility_consumers():
    for workflow, jobs in GUARDS.items():
        text = (Path(".github/workflows") / workflow).read_text()
        assert "uses: ./.github/workflows/molecular-utility-checks.yml" in text
        for name in jobs:
            block = text.split("\n  " + name + ":\n", 1)[1].split("    steps:", 1)[0]
            assert "utility-scope" in block
            assert "needs.utility-scope.outputs.utility_only != 'true'" in block


def test_retired_gate_paths_cannot_return_as_a_competing_implementation(monkeypatch):
    existing = Path.exists
    monkeypatch.setattr(
        Path, "exists", lambda path: str(path) in scope["RETIRED"] or existing(path)
    )
    assert not scope["selected"](scope["FILES"])
