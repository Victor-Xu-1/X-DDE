"""Closed native-confidence frame and exact renderer/default-consumer checks."""

SOURCES = {
    "frontend/src/presentation/plots/InteractivePlot.tsx",
    "frontend/src/presentation/plots/InteractivePlot.frame.test.tsx",
    "frontend/src/presentation/plots/usePlotFrame.ts",
    "frontend/src/presentation/plots/plots.css",
    "frontend/src/operations/ConfidencePanel.tsx",
    "frontend/src/operations/ConfidencePanel.test.tsx",
    "frontend/src/viewer/confidence-controls.css",
    "frontend/src/presentation/prediction-results.css",
    "frontend/src/presentation/prediction-wide-inspection.css",
    "frontend/src/presentation/PredictionPlotSize.ts",
    "frontend/src/presentation/PredictionPlotSize.test.tsx",
    "server_tests/test_confidence_frame_browser.py",
    "server_tests/test_prediction_workspace_browser.py",
}
FILES = SOURCES | {
    "scripts/confidence-frame-scope.py", "tests/test_confidence_frame_scope.py",
    "scripts/prediction-workspace-scope.py", "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/chart-quality-checks.yml",
    ".github/workflows/simulation-view-checks.yml",
    ".github/workflows/appearance-checks.yml",
    ".github/workflows/viewer-checks.yml",
    ".github/workflows/landscape-checks.yml",
    "docs/frontend-layout.md", "pyproject.toml", "uv.lock",
    "frontend/package.json", "frontend/package-lock.json", "install.sh", "install.ps1",
}


def selected(changed, event="push"):
    paths = set(changed)
    return event in {"push", "pull_request"} and bool(paths & SOURCES) and paths <= FILES
