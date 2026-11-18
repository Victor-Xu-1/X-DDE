"""Route receptor result changes to their native evidence gate."""

import os
import re
from pathlib import Path
from runpy import run_path
import subprocess

RECEPTOR = {
    "frontend/src/receptors/ReceptorResults.tsx",
    "frontend/src/receptors/ReceptorResults.test.tsx",
    "frontend/src/receptors/receptors.css",
    "server_tests/test_receptor_workspace_browser.py",
}
ROUTING = {
    ".github/workflows/viewer-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    "scripts/receptor-workspace-scope.py",
}


def receptor_workspace_only(base, event):
    if event not in {"push", "pull_request"}:
        return False
    if (
        os.environ.get("GITHUB_REF_NAME") != "main"
        or not re.fullmatch(r"[0-9a-f]{40}", base)
        or subprocess.run(
            ["git", "cat-file", "-e", f"{base}^{{commit}}"], capture_output=True,
        ).returncode
    ):
        base = subprocess.check_output(
            ["git", "merge-base", "HEAD", "origin/main"], text=True,
        ).strip()
    changed = set(subprocess.check_output(
        ["git", "diff", "--name-only", base, "HEAD"], text=True,
    ).splitlines())
    if not changed & RECEPTOR:
        return False
    mirrors = changed - RECEPTOR - ROUTING
    release = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
    return mirrors <= release["VERSION_FILES"] and release["only_version_mirrors"](base, mirrors)


if __name__ == "__main__":
    selected = receptor_workspace_only(
        os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", "")
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"receptor_workspace_only={str(selected).lower()}\n")
