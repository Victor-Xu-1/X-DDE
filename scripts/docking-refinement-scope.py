"""Delegate only an exact receptor-refinement diff to its native docking gate."""

import os
import subprocess

FILES = {
    "server_tests/flexible_receptor_browser.py",
    "server_tests/flexible_receptor_questionnaire.py",
    "src/opendde_workbench/research/pose_minimization.py",
    "src/opendde_workbench/workflows/quality_bindings.py",
    "tests/test_docking.py",
    ".github/workflows/workflow-quality-checks.yml",
    "src/opendde_workbench/docking/contract.py",
    "src/opendde_workbench/docking/native.py",
    "src/opendde_workbench/docking/result.py",
    "src/opendde_workbench/docking/snapshot.py",
    "src/opendde_workbench/docking/supervise.py",
    "src/opendde_workbench/research/outputs.py",
    "src/opendde_workbench/docking/flexible_contract.py",
    "src/opendde_workbench/docking/flexible_receptor.py",
    "src/opendde_workbench/docking/flexible_validation.py",
    "src/opendde_workbench/docking/receptor_atoms.py",
    "src/opendde_workbench/docking/receptor_links.py",
    "src/opendde_workbench/docking/residue_geometry.py",
    "frontend/src/docking/DockingForm.tsx",
    "frontend/src/docking/DockingResults.tsx",
    "frontend/src/docking/DockingResults.test.tsx",
    "frontend/src/docking/DockingReview.tsx",
    "frontend/src/docking/types.ts",
    "frontend/src/docking/FlexibleReceptorSettings.tsx",
    "frontend/src/docking/FlexibleReceptorForm.test.tsx",
    "frontend/src/docking/ReceptorRefinementSummary.tsx",
    "frontend/src/docking/useReceptorRefinement.ts",
    "server_tests/test_native_docking.py",
    "server_tests/flexible_receptor_probe.py",
    "tests/test_flexible_receptor.py",
    "tests/test_docking_reference.py",
    "scripts/docking-refinement-scope.py",
    "tests/ci/test_docking_refinement_scope.py",
    ".github/workflows/docking-runtime-checks.yml",
    ".github/workflows/case-bundle-checks.yml",
    ".github/workflows/reference-input-checks.yml",
    ".github/workflows/stat6-template-checks.yml",
    ".github/workflows/task-readiness-checks.yml",
    ".github/workflows/pose-handoff-checks.yml",
    ".github/workflows/pocket-result-checks.yml",
    "docs/scientific-upgrade.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def selected(changed):
    names = set(changed)
    return "src/opendde_workbench/docking/flexible_receptor.py" in names and names <= FILES


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" and (
        not base or set(base) == {"0"}
    ):
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = (
        subprocess.check_output(
            ["git", "diff", "--name-only", base, "HEAD"], text=True
        ).splitlines()
        if base
        else []
    )
    result = os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" and selected(changed)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("refinement_only=" + str(result).lower() + "\n")


if __name__ == "__main__":
    main()
