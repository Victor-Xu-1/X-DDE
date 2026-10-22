"""Select direct archive consumers for immutable STAT6 and DEL data updates."""

import os
import subprocess

SOURCES = {
    "src/opendde_workbench/examples/del_bundle_release.py",
    "src/opendde_workbench/examples/stat6_bundle_release.py",
}
PATHS = {
    *SOURCES,
    "tests/test_del_case_component.py",
    "tests/test_reviewed_stat6_case_data.py",
    "scripts/case-data-scope.py",
    "tests/ci/test_case_data_scope.py",
    "tests/ci/test_case_bundle_scope.py",
    ".github/workflows/case-bundle-checks.yml",
    "docs/design/screening-and-del.md",
    "docs/reviewed-example-data.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def selected(changed):
    changed = set(changed)
    return bool(SOURCES & changed) and changed <= PATHS


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
    value = os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" and selected(changed)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("case_data_only=" + str(value).lower() + "\n")


if __name__ == "__main__":
    main()
