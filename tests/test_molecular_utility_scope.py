"""Keep scientific execution and shared-viewer changes in their original gates."""

import re
import runpy
from fnmatch import fnmatchcase
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/molecular-utility-scope.py")
GUARDS = {
    "navigation-shell-checks.yml": ["research-shell"],
    "pose-cluster-checks.yml": ["cluster"],
    "workflow-quality-checks.yml": ["measured-handoff"],
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
    assert destination.read_text() == (
        "initial_pose_power_only=false\n"
        "backend_placement_only=false\ntask_power_only=false\nmodule_backend_only=false\n"
        "module_power_only=false\n"
        "native_state_only=false\ncompact_example_only=false\nmobile_header_only=false\n"
        "mobile_viewer_only=false\nrecognition_power_only=false\n"
        "potential_display_only=false\nutility_navigation_only=false\n"
        "touch_controls_only=false\n"
        "runtime_switch_only=false\nresult_header_only=false\n"
        f"utility_only={str(not mixed).lower()}\n"
    )
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


def test_contextual_switch_scope_covers_reviewed_consumers_and_preserves_scientific_checks():
    changed = scope["RUNTIME_FILES"]
    approved = scope["RUNTIME_CONSUMERS"]
    selected = scope["runtime_selected"]
    assert selected(changed, "pull_request", shared=approved)
    assert selected(changed, "push", shared=approved)
    assert not selected(changed, "workflow_dispatch", shared=approved)
    assert not selected(
        changed | {"src/opendde_workbench/backend_router.py"}, "push", shared=approved
    )
    assert not selected(changed, "push", shared={})
    assert not selected(approved, "push", shared=approved)
    handoff = ".github/workflows/workflow-quality-checks.yml"
    unrelated_workflow_edit = {**approved, handoff: (approved[handoff][0], "changed")}
    assert not selected(changed, "push", shared=unrelated_workflow_edit)


def test_result_header_scope_only_covers_the_exact_layout_and_direct_consumers():
    selected = scope["result_header_selected"]
    files = scope["RESULT_HEADER_FILES"]
    approved = scope["RESULT_HEADER_BLOBS"]
    assert selected(files, "push", blobs=approved)
    assert selected(files, "pull_request", blobs=approved)
    assert not selected(files, "workflow_dispatch", blobs=approved)
    assert not selected(files | {"frontend/src/viewer/StructureViewer.tsx"}, "push", blobs=approved)
    assert not selected(files - {"frontend/src/App.tsx"}, "push", blobs=approved)
    unrelated = {**approved, "frontend/src/App.tsx": ("other", "changes")}
    assert not selected(files, "push", blobs=unrelated)
    for name in ("generated-candidate-checks.yml", "molecular-utility-checks.yml"):
        path = ".github/workflows/" + name
        mixed = {**approved, path: (approved[path][0], "unreviewed")}
        assert not selected(files, "pull_request", blobs=mixed)


@pytest.mark.parametrize(
    "key",
    [
        "BACKEND_PLACEMENT_FILES", "TASK_POWER_FILES", "MODULE_BACKEND_FILES",
        "NATIVE_STATE_FILES", "COMPACT_EXAMPLE_FILES", "MOBILE_HEADER_FILES",
        "INITIAL_POSE_POWER_FILES", "MOBILE_VIEWER_FILES", "SPLIT_VIEWER_FILES",
        "MODULE_POWER_FILES",
    ],
)
def test_backend_switch_placement_scope_requires_the_exact_reviewed_diff(monkeypatch, key):
    select = scope["reviewed_selected"]
    files = scope[key]
    blobs = {(ref, path): f"{ref}:{path}" for path in files for ref in ("base", "HEAD")}
    monkeypatch.setitem(select.__globals__, "blob_digest", lambda ref, path: blobs[ref, path])
    payload = [[path, blobs["base", path], blobs["HEAD", path]] for path in sorted(files)]
    encoded = scope["json"].dumps(payload, separators=(",", ":")).encode()
    digest = scope["hashlib"].sha256(encoded).hexdigest()
    assert select(files, "push", "base", files, digest)
    assert select(files, "pull_request", "base", files, digest)
    assert not select(files, "workflow_dispatch", "base", files, digest)
    mixed = files | {"src/opendde_workbench/backend_router.py"}
    assert not select(mixed, "push", "base", files, digest)
    blobs["HEAD", min(files)] = "unreviewed edit"
    assert not select(files, "push", "base", files, digest)
