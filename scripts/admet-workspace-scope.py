"""Delegate the closed ADMET result batch to its exact native property checks."""

import os
import subprocess

SOURCES = {
    "frontend/src/admet/AdmetResults.tsx",
    "frontend/src/admet/AdmetResults.test.tsx",
    "frontend/src/admet/AdmetSelectedMolecule.tsx",
    "frontend/src/admet/AdmetCandidateViews.tsx",
    "frontend/src/admet/EndpointTable.tsx",
    "frontend/src/admet/EndpointValue.tsx",
    "frontend/src/admet/EndpointValue.test.tsx",
    "frontend/src/admet/types.ts",
    "frontend/src/admet/admet.css",
    "server_tests/test_admet_inspection_browser.py",
    "server_tests/test_admet_workspace_browser.py",
}
FILES = SOURCES | {
    "scripts/admet-workspace-scope.py", "tests/test_admet_workspace_scope.py",
    ".github/workflows/admet-inspection-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/pose-handoff-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml", "uv.lock", "frontend/package.json", "frontend/package-lock.json",
    "install.sh", "install.ps1",
}


def selected(changed, event="push"):
    changed = set(changed)
    return event in {"push", "pull_request"} and bool(changed & SOURCES) and changed <= FILES


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
        if base and set(base) != {"0"} else []
    )
    value = selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("admet_result_only=" + str(value).lower() + "\n")


if __name__ == "__main__":
    main()
