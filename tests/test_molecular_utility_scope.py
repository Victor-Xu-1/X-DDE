"""Keep scientific execution and shared-viewer changes in their original gates."""

import re
import runpy
from fnmatch import fnmatchcase
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/molecular-utility-scope.py")
GUARDS = {
    "task-service-availability.yml": ["availability"],
    "prediction-workspace-checks.yml": ["interface"],
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
    assert scope["selected"](scope["FILES"], shared=scope["SHARED"])
    assert not scope["selected"]([])
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")


def test_shared_example_changes_alone_keep_the_original_consumer_gates():
    assert not scope["selected"]([
        "frontend/src/examples/ExampleActions.tsx",
        "frontend/src/examples/ExampleActions.test.tsx",
        "pyproject.toml",
    ])


@pytest.mark.parametrize("event", ["push", "pull_request"])
@pytest.mark.parametrize("mixed", [False, True])
def test_refreshed_utility_scope_uses_the_reviewed_main_diff(
    monkeypatch, tmp_path, event, mixed,
):
    changed = [
        "frontend/src/utilities/UtilityTask.tsx",
        ".github/workflows/prediction-workspace-checks.yml",
        "pyproject.toml",
    ]
    if mixed:
        changed.append("src/opendde_workbench/backend_router.py")
    calls = []

    def output(args, **_kwargs):
        calls.append(args)
        if args == ["git", "merge-base", "origin/main", "HEAD"]:
            return "reviewed-main"
        assert args == ["git", "diff", "--name-only", "reviewed-main", "HEAD"]
        return "\n".join(changed)

    destination = tmp_path / "scope-output"
    monkeypatch.setenv("BASE", "previous-branch-head")
    monkeypatch.setenv("GITHUB_REF_NAME", "feat/utility-template-access")
    monkeypatch.setenv("GITHUB_EVENT_NAME", event)
    monkeypatch.setenv("GITHUB_OUTPUT", str(destination))
    monkeypatch.setattr(scope["subprocess"], "check_output", output)
    scope["main"]()
    assert destination.read_text() == f"utility_only={str(not mixed).lower()}\n"
    assert calls[0] == ["git", "merge-base", "origin/main", "HEAD"]


@pytest.mark.parametrize("name", [
    "reference-input-checks.yml", "defined-site-checks.yml",
    "pocket-result-checks.yml", "research-material-checks.yml",
])
def test_consumer_gates_cover_the_final_pull_request_head(name):
    text = (Path(".github/workflows") / name).read_text()
    assert "  push:\n    paths: &molecular_review_paths" in text
    assert "  pull_request:\n    paths: *molecular_review_paths" in text


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


@pytest.mark.parametrize("name,job", [
    ("appearance-checks.yml", "appearance"),
    ("chart-quality-checks.yml", "statistical-previews"),
    ("landscape-checks.yml", "landscapes"),
    ("simulation-view-checks.yml", "previews"),
    ("viewer-checks.yml", "molecular-preview"),
])
def test_inherited_main_callers_use_the_same_canonical_utility_output(name, job):
    parent = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    assert "utility_only:\n        value: ${{ jobs.utility-scope.outputs.utility_only }}" in parent
    workflow = (Path(".github/workflows") / name).read_text()
    block = workflow.split("\n  " + job + ":\n", 1)[1].split("    steps:", 1)[0]
    dependencies = re.search(r"^    needs: (.+)$", block, re.MULTILINE)
    assert dependencies
    needs = [item.strip().strip("\"'") for item in dependencies[1].strip("[]").split(",")]
    assert "prediction-scope" in needs
    assert "needs.prediction-scope.outputs.utility_only != 'true'" in block


@pytest.mark.parametrize("path", scope["SHARED"])
def test_shared_presentation_requires_both_exact_reviewed_git_blobs(path):
    changed = ["frontend/src/utilities/UtilityTask.tsx", path]
    approved = scope["SHARED"]
    assert scope["selected"](changed, shared=approved)
    assert not scope["selected"]([path], shared=approved)
    assert not scope["selected"](changed)
    before, after = approved[path]
    for pair in [("unknown-before", after), (before, "unknown-after"), (before, None)]:
        assert not scope["selected"](changed, shared={path: pair})
    assert not scope["selected"](
        [*changed, "src/opendde_workbench/backend_router.py"], shared=approved,
    )


def test_retired_gate_paths_cannot_return_as_a_competing_implementation(monkeypatch):
    existing = Path.exists
    monkeypatch.setattr(
        Path, "exists", lambda path: str(path) in scope["RETIRED"] or existing(path)
    )
    assert not scope["selected"](scope["FILES"])
