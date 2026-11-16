"""Delegate only a closed brain-profile batch; preserve all mixed scientific gates."""

import os
import subprocess

SOURCES = {
    "src/opendde_workbench/examples/pin_validation.py",
    "frontend/src/admet/AdmetForm.tsx",
    "frontend/src/admet/brain.css",
    "frontend/src/admet/AdmetResults.tsx",
    "frontend/src/admet/AdmetSettings.tsx",
    "frontend/src/admet/BrainForm.test.tsx",
    "frontend/src/admet/BrainForm.tsx",
    "frontend/src/admet/BrainScope.test.tsx",
    "frontend/src/admet/BrainScope.tsx",
    "frontend/src/admet/EndpointTable.tsx",
    "frontend/src/admet/types.ts",
    "frontend/src/operations/ToolCenter.tsx",
    "frontend/src/operations/catalog.ts",
    "frontend/src/studio/method-choices.ts",
    "frontend/src/studio/research-modules.ts",
    "frontend/src/studio/task-kind-rules.ts",
    "frontend/src/utilities/UtilityWorkspace.test.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "server_tests/test_brain_profile_browser.py",
    "src/opendde_workbench/admet/contract.py",
    "src/opendde_workbench/admet/presentation.py",
    "src/opendde_workbench/capabilities/definitions.py",
    "src/opendde_workbench/capabilities/modalities.py",
    "src/opendde_workbench/examples/catalogue.json",
    "src/opendde_workbench/examples/preparation.py",
    "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
    "src/opendde_workbench/examples/stat6/guidance.py",
    "src/opendde_workbench/examples/stat6/task_requests.py",
    "src/opendde_workbench/task_history/kinds.py"
}
FILES = SOURCES | {
    ".github/workflows/example-result-set-checks.yml",
    ".github/workflows/admet-inspection-checks.yml",
    ".github/workflows/antibody-cdr-input-checks.yml",
    ".github/workflows/brain-profile-checks.yml",
    ".github/workflows/defined-site-checks.yml",
    ".github/workflows/examples-checks.yml",
    ".github/workflows/module-example-checks.yml",
    ".github/workflows/pocket-result-checks.yml",
    ".github/workflows/pose-handoff-checks.yml",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/research-material-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/simulation-questionnaire-checks.yml",
    ".github/workflows/stat6-preparation-checks.yml",
    ".github/workflows/stat6-template-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/task-history-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/task-readiness-checks.yml",
    ".github/workflows/task-status-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/utility-tools-checks.yml",
    "docs/frontend-layout.md",
    "frontend/package-lock.json",
    "frontend/package.json",
    "install.ps1",
    "install.sh",
    "pyproject.toml",
    "scripts/brain-profile-scope.py",
    "scripts/record-study-catalogue.py",
    "tests/test_brain_profile.py",
    "tests/test_brain_profile_scope.py",
    "tests/test_stat6_predicted_references.py",
    "tests/test_study_module_revisions.py",
    "uv.lock"
}


def selected(changed, event="push"):
    paths = set(changed)
    return event in {"push", "pull_request"} and bool(paths & SOURCES) and paths <= FILES


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", base, "HEAD"], text=True
    ).splitlines() if base and set(base) != {"0"} else []
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("brain_only=" + str(selected(
            changed, os.environ.get("GITHUB_EVENT_NAME", "push")
        )).lower() + "\n")


if __name__ == "__main__":
    main()
