"""Delegate a bounded prediction-presentation batch to its exact browser/consumer gate."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "frontend/public/fonts/plus-jakarta/*",
    "frontend/src/presentation/Prediction*",
    "frontend/src/presentation/prediction-*.css",
    "frontend/src/integrations/prediction-presentation*",
    "frontend/src/integrations/Mol1Form.tsx",
    "frontend/src/integrations/Mol1Confidence.tsx",
    "frontend/src/integrations/ScientificForm.tsx",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/studio/PredictionResults.tsx",
    "frontend/src/studio/PredictionResults.test.tsx",
    "frontend/src/studio/HomeWorkspace.test.tsx",
    "frontend/src/studio/Header.tsx",
    "frontend/src/operations/ConfidencePanel*",
    "frontend/src/guided/MolecularInputs.tsx",
    "frontend/src/guided/MolecularInputs.test.tsx",
    "frontend/src/TaskForm.tsx",
    "frontend/src/App.tsx",
    "server_tests/prediction_workspace_case.py",
    "server_tests/test_prediction_workspace_browser.py",
    "server_tests/test_prediction_entry_browser.py",
    "server_tests/test_template_controls_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/landscape-checks.yml",
    "docs/frontend-layout.md",
    "docs/quality/frontend.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def selected(changed, event="push"):
    return (
        event in {"push", "pull_request"}
        and any(name.startswith("frontend/src/presentation/Prediction") for name in changed)
        and all(any(fnmatch.fnmatchcase(name, pattern) for pattern in PATTERNS) for name in changed)
    )


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = (
        subprocess.check_output(
            ["git", "diff", "--name-only", base, "HEAD"], text=True
        ).splitlines()
        if base and set(base) != {"0"}
        else []
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        stream.write(
            "prediction_only="
            + str(selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )


if __name__ == "__main__":
    main()
