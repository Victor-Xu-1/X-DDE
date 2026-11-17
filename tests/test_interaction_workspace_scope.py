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


def test_synchronization_callers_reuse_the_closed_contact_owner():
    prediction = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    assert "value: ${{ jobs.scope.outputs.interaction_only }}" in prediction
    assert "${{ steps.reference.outputs.interaction_only }}" in prediction
    assert "run: python scripts/interaction-workspace-scope.py" in prediction
    interface = prediction.split("  interface:", 1)[1].split("    steps:", 1)[0]
    assert "needs.scope.outputs.interaction_only != 'true'" in interface
    for filename, job in (
        ("task-layout-checks.yml", "scoped-layout"),
        ("user-interface-checks.yml", "presentation"),
    ):
        workflow = Path(f".github/workflows/{filename}").read_text()
        body = workflow.split(f"  {job}:", 1)[1].split("    steps:", 1)[0]
        assert "needs.prediction-scope.outputs.interaction_only != 'true'" in body


@pytest.mark.parametrize("event", ["push", "pull_request"])
@pytest.mark.parametrize("mixed", [False, True])
def test_refreshed_epitope_scope_outputs_are_closed(monkeypatch, tmp_path, event, mixed):
    changed = [*scope["EPITOPE_SOURCES"], ".github/workflows/prediction-workspace-checks.yml"]
    if mixed:
        changed.append("frontend/src/App.tsx")
    calls = []

    def output(args, **_kwargs):
        calls.append(args)
        if args == ["git", "merge-base", "origin/main", "HEAD"]:
            return "reviewed-main"
        assert args == ["git", "diff", "--name-only", "reviewed-main", "HEAD"]
        return "\n".join(changed)

    destination = tmp_path / "scope-output"
    monkeypatch.setenv("BASE", "previous-branch-head")
    monkeypatch.setenv("GITHUB_REF_NAME", "fix/epitope-native-workspace")
    monkeypatch.setenv("GITHUB_EVENT_NAME", event)
    monkeypatch.setenv("GITHUB_OUTPUT", str(destination))
    monkeypatch.setattr(scope["subprocess"], "check_output", output)
    scope["main"]()
    assert dict(line.split("=", 1) for line in destination.read_text().splitlines()) == {
        "interaction_only": str(not mixed).lower(),
        "epitope_only": str(not mixed).lower(),
        "epitope_changed": "true",
        "reference_only": "false",
    }
    assert calls[0] == ["git", "merge-base", "origin/main", "HEAD"]


@pytest.mark.parametrize("event", ["push", "pull_request"])
@pytest.mark.parametrize("publication", [False, True])
def test_shared_contact_styles_retain_both_native_consumers(
    monkeypatch, tmp_path, event, publication,
):
    changed = ["frontend/src/integrations/interaction-workspace.css"]
    if publication:
        changed.append("pyproject.toml")
    output = tmp_path / "scope-output"
    monkeypatch.setenv("BASE", "a" * 40)
    monkeypatch.setenv("GITHUB_REF_NAME", "main")
    monkeypatch.setenv("GITHUB_EVENT_NAME", event)
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))
    monkeypatch.setattr(
        scope["subprocess"], "check_output", lambda *_args, **_kwargs: "\n".join(changed),
    )
    scope["main"]()
    assert dict(line.split("=", 1) for line in output.read_text().splitlines()) == {
        "interaction_only": "true",
        "epitope_only": "false",
        "epitope_changed": "true",
        "reference_only": "false",
    }


def test_reference_preview_has_a_closed_source_and_direct_dependency_scope():
    assert scope["reference_selected"](scope["REFERENCE_FILES"])
    for source in scope["REFERENCE_SOURCES"]:
        assert scope["reference_selected"]([source])
    assert not scope["reference_selected"](scope["REFERENCE_FILES"], "workflow_dispatch")
    assert not scope["reference_selected"](["pyproject.toml"])
    for unrelated in (*scope["SOURCES"], "frontend/src/viewer/frame.ts",
                      "frontend/src/App.tsx", "src/opendde_workbench/discovery/import_runner.py"):
        assert not scope["reference_selected"]([*scope["REFERENCE_SOURCES"], unrelated])


def test_reference_gate_retains_default_depiction_and_exact_source_checks():
    workflow = Path(".github/workflows/structure-layout-checks.yml").read_text()
    body = workflow.split("  interaction-workspace:", 1)[1].split("  view-alignment:", 1)[0]
    for required in ("ReferenceImportResults.test.tsx", "MoleculeImage.test.tsx",
                     "depiction-renderer.test.ts", "structure-bytes.test.ts",
                     "StructureViewer.test.tsx", "SelectedAssetPreview.test.tsx",
                     "test_reference_preview_browser.py"):
        assert required in body
    for required in ("test_reference_replay.py", "test_reference_import.py",
                     "test_source_transport.py", "test_source_proxy.py"):
        assert required in body
    browser = Path("server_tests/test_reference_preview_browser.py").read_text()
    assert "test_ketcher_startup_browser import" in browser
    for name in ("ketcher-depiction", "workspace-preview", "molecular-preview", "viewer"):
        text = Path(f".github/workflows/{name}-checks.yml").read_text()
        assert "scripts/interaction-workspace-scope.py" in text
        assert "reference_only != 'true'" in text
    prediction = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    interface = prediction.split("  interface:", 1)[1].split("    runs-on:", 1)[0]
    assert "reference_only != 'true'" in interface
    for name, job in (("task-layout", "scoped-layout"), ("user-interface", "presentation")):
        text = Path(f".github/workflows/{name}-checks.yml").read_text()
        body = text.split(f"  {job}:", 1)[1].split("    runs-on:", 1)[0]
        assert "needs.prediction-scope.outputs.reference_only != 'true'" in body
