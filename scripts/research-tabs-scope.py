"""Select only shared tab geometry/lifecycle work, never scientific execution."""

import os
import subprocess
from pathlib import Path
from runpy import run_path

SOURCES = {
    "frontend/src/presentation/ResearchTabs.tsx",
    "frontend/src/presentation/research-tabs.css",
}
FILES = SOURCES | {
    "frontend/src/presentation/ResearchTabs.test.tsx",
    "server_tests/test_research_tabs_browser.py",
    "scripts/research-tabs-scope.py",
    "tests/test_research_tabs_scope.py",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/molecular-preview-checks.yml",
    ".github/workflows/pose-handoff-checks.yml",
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


def covered_by_molecule_workbench(changed, event, base):
    scope = run_path(str(Path(__file__).with_name("molecular-utility-scope.py")))
    return scope["reviewed_selected"](
        changed, event, base,
        scope["DESKTOP_MOLECULE_WORKBENCH_FILES"],
        scope["DESKTOP_MOLECULE_WORKBENCH_DIFF"],
        scope_pin="DESKTOP_MOLECULE_WORKBENCH_DIFF",
    )


def main():
    base = os.environ.get("BASE", "")
    # First branch pushes may have an empty before SHA; never compare only a fixup.
    if os.environ.get("GITHUB_REF", "") != "refs/heads/main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = (
        subprocess.check_output(
            ["git", "diff", "--name-only", base, "HEAD"], text=True
        ).splitlines()
        if base and set(base) != {"0"} else []
    )
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    paths = set(changed)
    if (
        event in {"push", "pull_request"}
        and paths & SOURCES
        and paths - FILES
        and not covered_by_molecule_workbench(paths, event, base)
    ):
        raise RuntimeError("Mixed shared-tab changes require their own reviewed CI scope.")
    value = selected(changed, event)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("research_tabs_only=" + str(value).lower() + "\n")


if __name__ == "__main__":
    main()
