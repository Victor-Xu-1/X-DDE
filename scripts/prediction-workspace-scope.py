"""Delegate a bounded prediction-presentation batch to its exact browser/consumer gate."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "frontend/public/fonts/plus-jakarta/*",
    "frontend/src/presentation/Prediction*",
    "frontend/src/presentation/prediction-*.css",
    "frontend/src/presentation/prediction-heading-focus*",
    "frontend/src/viewer/ChainControls*",
    "frontend/src/viewer/chain-controls.css",
    "frontend/src/viewer/chain-visibility*",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/StructureViewer.test.tsx",
    "frontend/src/viewer/scene.ts",
    "frontend/src/viewer/frame.ts",
    "frontend/src/viewer/style.test.ts",
    "frontend/src/viewer/style.ts",
    "frontend/src/viewer/protocol.ts",
    "frontend/src/viewer/StructureInspection*",
    "frontend/src/viewer/structure-inspection.css",
    "frontend/src/viewer/polymer-detail.ts",
    "frontend/src/viewer/residue-selection*",
    "frontend/src/viewer/display-readiness*",
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
    "server_tests/test_ensemble_results_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/landscape-checks.yml",
    "docs/frontend-layout.md",
    "docs/quality/frontend.md",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)

CONFIDENCE_PATTERNS = (
    "src/opendde_workbench/confidence.py",
    "tests/test_import_confidence.py",
    "frontend/src/operations/ConfidencePanel*",
    "server_tests/prediction_workspace_case.py",
    "server_tests/native_confidence_case.py",
    "server_tests/test_native_confidence_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "docs/frontend-layout.md",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def native_confidence_only(changed):
    return (
        "src/opendde_workbench/confidence.py" in changed
        and "frontend/src/operations/ConfidencePanel.tsx" in changed
        and all(
            any(fnmatch.fnmatchcase(name, pattern) for pattern in CONFIDENCE_PATTERNS)
            for name in changed
        )
    )


def selected(changed, event="push"):
    if event in {"push", "pull_request"} and native_confidence_only(changed):
        return True
    return (
        event in {"push", "pull_request"}
        and any(
            name.startswith(
                ("frontend/src/presentation/Prediction", "frontend/src/viewer/StructureInspection")
            )
            for name in changed
        )
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
        stream.write("native_confidence=" + str(native_confidence_only(changed)).lower() + "\n")
        stream.write(
            "prediction_only="
            + str(selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )


if __name__ == "__main__":
    main()
