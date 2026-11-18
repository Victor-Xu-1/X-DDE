"""Select the archived prepared-input checks while keeping mixed diffs on both paths."""

import os
import re
import subprocess
from pathlib import Path
from runpy import run_path

RESULTS = {
    "frontend/src/operations/PreparedInputResults.tsx",
    "frontend/src/operations/PreparedInputResults.test.tsx",
    "frontend/src/operations/prepared-input-results.css",
    "frontend/src/operations/prepared-input-model.ts",
    "frontend/src/operations/usePreparedDocuments.ts",
    "server_tests/test_prepared_input_workspace_browser.py",
}
SUPPORT = {
    ".github/workflows/sequence-result-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    "scripts/prepared-input-scope.py",
}


def prepared_scope(base, event):
    if event not in {"push", "pull_request"}:
        return False, False
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
    if not changed & RESULTS:
        return False, False
    rest = changed - RESULTS - SUPPORT
    scope = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
    only = not rest or (
        rest <= scope["VERSION_FILES"] and scope["only_version_mirrors"](base, rest)
    )
    return True, only


if __name__ == "__main__":
    selected, only = prepared_scope(
        os.environ.get("BASE", ""), os.environ.get("GITHUB_EVENT_NAME", ""),
    )
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write(f"prepared_inputs={str(selected).lower()}\n")
        out.write(f"prepared_inputs_only={str(only).lower()}\n")
