"""Exact presentation-only setup summary and its existing preview consumers."""

SOURCES = {
    "frontend/src/presentation/PredictionSetup.tsx",
    "frontend/src/presentation/PredictionSetup.test.tsx",
    "frontend/src/presentation/prediction-setup-summary.css",
    "server_tests/test_prediction_setup_browser.py",
}
FILES = SOURCES | {
    "scripts/prediction-setup-scope.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_setup_scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml", "uv.lock", "frontend/package.json", "frontend/package-lock.json",
    "install.sh", "install.ps1",
}


def selected(changed, event="push"):
    changed = set(changed)
    return event in {"push", "pull_request"} and bool(changed & SOURCES) and changed <= FILES
