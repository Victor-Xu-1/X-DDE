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
