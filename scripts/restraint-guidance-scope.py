"""Delegate only the bounded optional-page instruction change to its direct form gate."""

import os
import subprocess

FILES = {
    "frontend/src/guided/Questionnaire.tsx",
    "frontend/src/guided/QuestionnaireGuidance.test.tsx",
    "frontend/src/integrations/ScientificForm.tsx",
    "frontend/src/simulations/SimulationForm.tsx",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    "scripts/restraint-guidance-scope.py",
    "tests/test_restraint_guidance_scope.py",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.ps1",
    "install.sh",
}


def selected(changed, event="push"):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and {
            "frontend/src/guided/Questionnaire.tsx",
            "frontend/src/guided/QuestionnaireGuidance.test.tsx",
        }.issubset(changed)
        and bool(
            changed
            & {
                "frontend/src/integrations/ScientificForm.tsx",
                "frontend/src/simulations/SimulationForm.tsx",
            }
        )
        and changed.issubset(FILES)
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
            "guidance_only="
            + str(selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )


if __name__ == "__main__":
    main()
