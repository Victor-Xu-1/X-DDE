"""Select only the shared native calculation-plan interface and direct contracts."""

import os
import subprocess

SOURCES = {
    "frontend/src/integrations/ScientificChoices.tsx",
    "frontend/src/integrations/ScientificChoicesCount.tsx",
    "frontend/src/integrations/ScientificChoices.css",
    "frontend/src/integrations/ExpertChoices.tsx",
}
FILES = SOURCES | {
    "frontend/src/integrations/ScientificChoices.test.tsx",
    "frontend/src/integrations/ScientificChoicesBudget.test.tsx",
    "frontend/src/integrations/ReinventForm.test.tsx",
    "scripts/calculation-plan-scope.py",
    "tests/test_calculation_plan_scope.py",
    "server_tests/test_calculation_plan_browser.py",
    ".github/workflows/molecule-design-review-checks.yml",
    ".github/workflows/property-model-review-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
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
        if base and set(base) != {"0"}
        else []
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        stream.write(
            "calculation_plan_only="
            + str(selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )


if __name__ == "__main__":
    main()
