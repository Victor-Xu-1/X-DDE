"""Route an exact workflow-quality batch to its direct consumers, not other science forms."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "src/opendde_workbench/workflows/bindings.py",
    "src/opendde_workbench/workflows/contracts.py",
    "src/opendde_workbench/workflows/service.py",
    "src/opendde_workbench/workflows/quality_*.py",
    "src/opendde_workbench/quality/assessment.py",
    "src/opendde_workbench/quality/result.py",
    "src/opendde_workbench/examples/stat6/preparation.py",
    "src/opendde_workbench/examples/stat6/workflow_replay.py",
    "src/opendde_workbench/examples/stat6/record_validation.py",
    "frontend/src/workflows/*",
    "frontend/src/quality/assessment.ts",
    "frontend/src/quality/generated.ts",
    "frontend/src/presentation/research-content.ts",
    "scripts/generate-capability-catalog.py",
    "scripts/workflow-quality-scope.py",
    "tests/quality_workflow_case.py",
    "tests/test_workflow_quality*.py",
    "tests/test_stat6_recipe_replay.py",
    "server_tests/test_workflow_template_browser.py",
    ".github/workflows/workflow-quality-checks.yml",
    ".github/workflows/task-action-checks.yml",
    ".github/workflows/sequence-result-checks.yml",
    ".github/workflows/stat6-template-checks.yml",
    ".github/workflows/module-example-checks.yml",
    ".github/workflows/harness-input-checks.yml",
    "docs/design/research-examples.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def selected(changed):
    return (
        bool(changed)
        and any("/workflows/" in name for name in changed)
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
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("workflow_only=" + str(selected(changed)).lower() + "\n")


if __name__ == "__main__":
    main()
