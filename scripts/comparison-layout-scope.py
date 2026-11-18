"""Select archived browser checks for a presentation-only comparison change."""

import os
import subprocess
import tomllib
from pathlib import Path

WORKFLOW = ".github/workflows/structure-comparison-checks.yml"
WORKFLOW_CHANGE = (
    "6b14ddb7fe8bd2a7bb2cf89200e9ac50fb3a4af5",
    "aa9409ad8d22d160f27b7550de35f9a02c7261a7",
)
LAYOUT = {
    "frontend/src/structure-comparison/ComparisonPreview.tsx",
    "frontend/src/structure-comparison/ComparisonResults.tsx",
    "frontend/src/structure-comparison/comparison-result-view.css",
}
VERSION_FILES = {
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}
ALLOWED = LAYOUT | VERSION_FILES | {
    WORKFLOW,
    "scripts/comparison-layout-scope.py",
    "server_tests/comparison_browser_harness.py",
    "server_tests/test_archived_comparison_browser.py",
}


def git(*args):
    return subprocess.check_output(["git", "-c", "core.commitGraph=false", *args])


def pure_publication_bump(base, paths):
    before = tomllib.loads(git("show", f"{base}:pyproject.toml").decode())["project"]["version"]
    after = tomllib.loads(git("show", "HEAD:pyproject.toml").decode())["project"]["version"]
    return all(
        git("show", f"{base}:{path}").replace(before.encode(), after.encode())
        == git("show", f"HEAD:{path}")
        for path in paths
    )


def layout_only(base, event):
    if event not in {"push", "pull_request"}:
        return False
    branch_push = event == "push" and os.environ.get("GITHUB_REF_NAME", "main") != "main"
    if branch_push or not base or not base.strip("0"):
        base = git("merge-base", "origin/main", "HEAD").decode().strip()
    changed = set(git("diff", "--name-only", base, "HEAD").decode().splitlines())
    if not changed & LAYOUT or not changed <= ALLOWED:
        return False
    if WORKFLOW in changed:
        pair = tuple(
            git("rev-parse", f"{rev}:{WORKFLOW}").decode().strip() for rev in (base, "HEAD")
        )
        if pair != WORKFLOW_CHANGE:
            return False
    return pure_publication_bump(base, changed & VERSION_FILES)


if __name__ == "__main__":
    selected = layout_only(os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", ""))
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"layout_only={str(selected).lower()}\n")
