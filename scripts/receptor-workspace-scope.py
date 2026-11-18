"""Route receptor result changes to their native evidence gate."""

import os
import re
from pathlib import Path
from runpy import run_path
import subprocess

ALIGNMENT = {
    "frontend/src/receptors/ReceptorResults.tsx",
    "frontend/src/receptors/ReceptorResults.test.tsx",
    "frontend/src/receptors/receptors.css",
    "server_tests/test_receptor_workspace_browser.py",
}
PREPARATION = {
    "frontend/src/receptors/StructurePrepareResults.tsx",
    "frontend/src/receptors/StructurePrepareResults.test.tsx",
    "frontend/src/receptors/prepared-structure.css",
    "server_tests/test_prepared_structure_workspace_browser.py",
}
SUPPORT = {
    ".github/workflows/viewer-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    "scripts/receptor-workspace-scope.py",
    # Exercise the shared result header in its own task history workflow.
    "server_tests/task_history_header_capture.py",
}


def receptor_workspaces(base, event):
    if event not in {"push", "pull_request"}:
        return ()
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
    selected = tuple(name for name, paths in (
        ("alignment", ALIGNMENT), ("preparation", PREPARATION),
    ) if changed & paths)
    if not selected:
        return ()
    mirrors = changed - ALIGNMENT - PREPARATION - SUPPORT
    release = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
    if mirrors and not (
        mirrors <= release["VERSION_FILES"] and release["only_version_mirrors"](base, mirrors)
    ):
        return ()
    return selected


if __name__ == "__main__":
    selected = receptor_workspaces(
        os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", "")
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"receptor_workspace_only={str(bool(selected)).lower()}\n")
        output.write(f"receptor_alignment={str('alignment' in selected).lower()}\n")
        output.write(f"structure_preparation={str('preparation' in selected).lower()}\n")
