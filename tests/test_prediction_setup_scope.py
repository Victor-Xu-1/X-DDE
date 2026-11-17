import runpy
from pathlib import Path

scope = runpy.run_path("scripts/prediction-setup-scope.py")
prediction = runpy.run_path("scripts/prediction-workspace-scope.py")


def test_setup_summary_delegates_to_exact_input_preview_consumers():
    for event in ("push", "pull_request"):
        for source in scope["SOURCES"]:
            assert scope["selected"]([source], event)
        assert scope["selected"](scope["FILES"], event)
        assert prediction["input_preview_only"](scope["FILES"], event)
        assert prediction["preview_changed"](scope["FILES"], event)
        assert prediction["prediction_only"](scope["FILES"], event)
        assert not prediction["drafts_changed"](scope["FILES"], event)
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"]([])


def test_mixed_form_viewer_or_backend_edits_keep_their_original_checks():
    for path in (
        "frontend/src/TaskForm.tsx", "frontend/src/integrations/Mol1Form.tsx",
        "frontend/src/integrations/ScientificForm.tsx", "frontend/src/viewer/scene.ts",
        "src/opendde_workbench/drafts/models.py",
        "frontend/src/presentation/PredictionInputPreview.tsx",
        "frontend/src/presentation/PredictionSetupBackup.tsx",
    ):
        assert not scope["selected"]([*scope["SOURCES"], path])


def test_gate_keeps_three_form_consumers_and_actual_preview_checks():
    workflow = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    body = workflow.split("name: Current prediction input review", 1)[1]
    body = body.split("      - name:", 1)[0]
    for check in ("PredictionSetup.test.tsx", "PredictionInputPreview.test.tsx",
                  "src/TaskForm.test.tsx", "src/integrations/Mol1Form.test.tsx",
                  "src/integrations/ScientificForm.test.tsx"):
        assert check in body
    assert "server_tests/test_prediction_setup_browser.py" in workflow
    assert "server_tests/test_prediction_input_preview_browser.py" in workflow
    assert "playwright install chrome" in workflow
