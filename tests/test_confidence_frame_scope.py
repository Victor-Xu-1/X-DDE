"""Only the exact native confidence-frame change delegates unrelated suites."""

import runpy
from pathlib import Path

scope = runpy.run_path("scripts/confidence-frame-scope.py")


def test_frame_scope_is_closed_and_requires_a_real_consumer():
    assert scope["selected"](scope["FILES"])
    for name in scope["SOURCES"]:
        assert scope["selected"]([name])
    assert not scope["selected"](["pyproject.toml"])
    assert not scope["selected"](scope["FILES"], "workflow_dispatch")
    for unrelated in ("frontend/src/App.tsx", "frontend/src/viewer/scene.ts",
                      "src/opendde_workbench/confidence.py"):
        assert not scope["selected"]([*scope["FILES"], unrelated])


def test_frame_scope_reuses_prediction_owner_and_preserves_mixed_changes():
    owner = runpy.run_path("scripts/prediction-workspace-scope.py")
    assert owner["prediction_only"](scope["FILES"])
    assert owner["native_confidence_only"](scope["FILES"])
    assert owner["confidence_changed"](scope["FILES"])
    for name in scope["SOURCES"]:
        assert owner["prediction_only"]([name])
        assert owner["native_confidence_only"]([name])
        assert owner["confidence_changed"]([name])
    assert not owner["prediction_only"]([*scope["FILES"], "src/opendde_workbench/api.py"])
    body = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    for name in ("InteractivePlot.frame.test.tsx", "ConfidencePanel.test.tsx",
                 "PredictionPlotSize.test.tsx",
                 "DatasetCharts.test.tsx", "FreeEnergyCycle.test.tsx",
                 "OverlapHeatmap.test.tsx", "FigureExport.test.tsx",
                 "server_tests/test_confidence_frame_browser.py"):
        assert name in body


def test_unrelated_suites_delegate_only_to_the_exact_frame_scope():
    for name in ("chart-quality", "appearance", "simulation-view", "viewer"):
        body = Path(f".github/workflows/{name}-checks.yml").read_text()
        assert "uses: ./.github/workflows/prediction-workspace-checks.yml" in body
        assert "needs.prediction-scope.outputs.confidence_frame != 'true'" in body
    for name, anchor in (("chart-quality", "chart_paths"), ("landscape", "landscape_paths")):
        body = Path(f".github/workflows/{name}-checks.yml").read_text()
        assert f"paths: &{anchor}" in body
        assert f"pull_request:\n    paths: *{anchor}" in body
    layout = Path(".github/workflows/structure-layout-checks.yml").read_text()
    adjacent = layout.split("  adjacent-result-consumers:", 1)[1].split("    steps:", 1)[0]
    assert "prediction-scope" in adjacent.split("    if:", 1)[0]
    assert "needs.prediction-scope.outputs.confidence_frame != 'true'" in adjacent


def test_main_setup_and_frame_scopes_remain_independent_after_refresh():
    owner = runpy.run_path("scripts/prediction-workspace-scope.py")
    setup = runpy.run_path("scripts/prediction-setup-scope.py")["FILES"]
    assert owner["setup_summary_only"](setup)
    assert not owner["confidence_frame_only"](setup)
    assert owner["confidence_frame_only"](scope["FILES"])
    assert not owner["setup_summary_only"](scope["FILES"])
    assert not owner["confidence_frame_only"]([*scope["FILES"], *setup])
    workflow = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    for field in ("confidence_frame", "setup_summary"):
        assert f"{field}: ${{{{ steps.select.outputs.{field} }}}}" in workflow
    assert "tests/test_confidence_frame_scope.py" in workflow
    assert "tests/test_prediction_setup_scope.py" in workflow
