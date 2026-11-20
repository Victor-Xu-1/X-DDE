"""Closed UI scope cannot skip shared styles or start unrelated native DEL work."""

import runpy
from pathlib import Path

import pytest

scope = runpy.run_path("scripts/target-evidence-scope.py")


def test_target_result_and_publication_companions():
    assert scope["selected"](scope["FILES"], css_safe=True)
    assert not scope["selected"](scope["FILES"])
    assert not scope["selected"]([], css_safe=True)
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"](scope["FILES"], "workflow_dispatch", css_safe=True)


@pytest.mark.parametrize("path", [
    "frontend/src/App.tsx", "frontend/src/presentation/ResearchTable.tsx",
    "frontend/src/discovery/ReferenceArchivePreview.tsx",
    "frontend/src/discovery/EvidenceSummary.tsx",
    "src/opendde_workbench/discovery/client.py",
    "server_tests/interaction_workspace_case.py",
])
def test_mixed_shared_changes_require_their_actual_consumers(path):
    assert not scope["selected"]([*scope["SOURCES"], path], css_safe=True)


def test_css_compares_only_the_exact_result_owned_selectors():
    shared = ".evidence-header { gap: 20px; }\n.library { display: grid; }"
    for selector in scope["SELECTORS"]:
        changed = shared + f"\n{selector} {{ gap: 8px; }}"
        assert scope["unrelated_css"](shared) == scope["unrelated_css"](changed)
    for selector in (
        ".target-evidence-results, .library", ".target-evidence-results + .library",
        ".library", ".evidence-header",
        ".discovery-results .evidence-header > div",
        ".target-evidence-results .evidence-header > div, .reference-import",
        ".target-evidence-results .evidence-header div",
        ".target-evidence-results .evidence-header > div .file-select",
    ):
        changed = shared + f"\n{selector} {{ gap: 8px; }}"
        assert scope["unrelated_css"](shared) != scope["unrelated_css"](changed)
    nested = shared + "\n@media (width > 1px) { .library { gap: 8px; } }"
    assert scope["unrelated_css"](shared) != scope["unrelated_css"](nested)


def test_unrelated_dataset_and_native_del_jobs_are_delegated():
    workflow = Path(".github/workflows/dataset-discovery-checks.yml").read_text()
    for job in ("contracts", "native-del-data"):
        body = workflow.split(f"  {job}:", 1)[1].split("    steps:", 1)[0]
        assert "needs: [target-ui-scope, utility-scope]" in body
        assert "needs.target-ui-scope.outputs.target_evidence_only != 'true'" in body
    body = workflow.split("  discovery-evidence:", 1)[1].split("  source-inputs:", 1)[0]
    assert "server_tests/test_target_evidence_browser.py" in body
    native = Path("server_tests/test_target_evidence_browser.py").read_text()
    assert "launch_review_browser" in native
    guidance = Path(".github/workflows/restraint-guidance-checks.yml").read_text()
    body = guidance.split("  frontend-guidance:", 1)[1].split("    steps:", 1)[0]
    assert "needs.scope.outputs.target_evidence_only != 'true'" in body


@pytest.mark.parametrize("event", ["push", "pull_request"])
@pytest.mark.parametrize("mixed", [False, True])
def test_scope_entrypoint_preserves_exact_owner_after_main_refresh(
    tmp_path, monkeypatch, event, mixed,
):
    """Exercise the output consumed by callers, not a second selector implementation."""
    changed = set(scope["FILES"])
    if mixed:
        changed.add("frontend/src/App.tsx")
    calls = []

    def git(*args):
        calls.append(args)
        if args == ("merge-base", "origin/main", "HEAD"):
            return "reviewed-main"
        if args == ("diff", "--name-only", "reviewed-main", "HEAD"):
            return "\n".join(sorted(changed))
        assert args == ("show", f"reviewed-main:{scope['CSS']}")
        return Path(scope["CSS"]).read_text()

    output = tmp_path / "outputs"
    monkeypatch.setenv("BASE", "previous-branch-head")
    monkeypatch.setenv("GITHUB_REF_NAME", "fix/target-evidence-layout")
    monkeypatch.setenv("GITHUB_EVENT_NAME", event)
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))
    monkeypatch.setitem(scope["main"].__globals__, "git", git)
    if mixed:
        with pytest.raises(SystemExit, match="explicit scoped check plan"):
            scope["main"]()
        assert not output.exists()
    else:
        scope["main"]()
        assert output.read_text() == "target_evidence_only=true\n"
    assert calls[0] == ("merge-base", "origin/main", "HEAD")


def test_synchronization_callers_delegate_only_the_closed_target_scope():
    prediction = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    assert "value: ${{ jobs.scope.outputs.target_evidence_only }}" in prediction
    assert "${{ steps.target_evidence.outputs.target_evidence_only }}" in prediction
    assert "run: python scripts/target-evidence-scope.py" in prediction
    interface = prediction.split("  interface:", 1)[1].split("    steps:", 1)[0]
    assert "needs.scope.outputs.target_evidence_only != 'true'" in interface
    for filename, job in (
        ("task-layout-checks.yml", "scoped-layout"),
        ("user-interface-checks.yml", "presentation"),
        ("structure-layout-checks.yml", "view-alignment"),
        ("structure-layout-checks.yml", "adjacent-result-consumers"),
    ):
        workflow = Path(f".github/workflows/{filename}").read_text()
        body = workflow.split(f"  {job}:", 1)[1].split("    steps:", 1)[0]
        assert "needs.prediction-scope.outputs.target_evidence_only != 'true'" in body
