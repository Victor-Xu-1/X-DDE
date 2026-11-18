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
    "frontend/src/receptors/PreparedStructureWorkspace.tsx",
    "frontend/src/diffsbdd/PreparedReceptorResults.tsx",
    "frontend/src/receptors/prepared-structure.css",
    "server_tests/test_prepared_structure_workspace_browser.py",
}
# These files dispatch many unrelated saved results. Only the reviewed
# preparation-routing delta may skip their general consumers' suites.
REVIEWED_ROUTES = {
    "frontend/src/operations/OperationResults.tsx": (
        "15a0115d50d6c1255d33479b29438046a8c2b398", "d6d27526c50a7ca3e3fd1b438c68a27a581b0470",
    ),
    "frontend/src/operations/OperationResults.test.tsx": (
        "b3c9b949c9392875913c3bac9056bfb97010512b", "31136c5381057c41db039914e72cfdde540f9278",
    ),
    "frontend/src/diffsbdd/ScientificDetails.tsx": (
        "263272650f70ce6f0bb7e0c6eb231c942da381ad", "d99c7bc76a0671b84e6d7c8f816f3e7799cb7f0b",
    ),
}
SUPPORT = {
    ".github/workflows/viewer-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/reference-pocket-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    ".github/workflows/example-result-set-checks.yml",
    "scripts/receptor-workspace-scope.py",
    "tests/test_receptor_workspace_scope.py",
    # Exercise the shared result header in its own task history workflow.
    "server_tests/task_history_header_capture.py",
}


def receptor_workspaces(base, event):
    if event not in {"push", "pull_request"}:
        return False, ()
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
        ("alignment", ALIGNMENT), ("preparation", PREPARATION | REVIEWED_ROUTES.keys()),
    ) if changed & paths)
    if not selected:
        return False, ()
    release = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
    matched = {
        path for path in changed & REVIEWED_ROUTES.keys()
        if tuple(release["git_blob"](revision, path) for revision in (base, "HEAD"))
        == REVIEWED_ROUTES[path]
    }
    mirrors = changed - ALIGNMENT - PREPARATION - SUPPORT - matched
    exclusive = not mirrors or (
        mirrors <= release["VERSION_FILES"] and release["only_version_mirrors"](base, mirrors)
    )
    return exclusive, selected


if __name__ == "__main__":
    exclusive, selected = receptor_workspaces(
        os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", "")
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"receptor_workspace_only={str(exclusive).lower()}\n")
        output.write(f"receptor_alignment={str('alignment' in selected).lower()}\n")
        output.write(f"structure_preparation={str('preparation' in selected).lower()}\n")
