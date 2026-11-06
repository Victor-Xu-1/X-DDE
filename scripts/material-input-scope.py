"""Closed delegation for shared material presentation and source lifecycle."""

import os
import subprocess

SOURCES = {
    "frontend/src/research/SequencePickerRetention.test.tsx",
    "frontend/src/diffsbdd/ReferencePicker.tsx",
    "frontend/src/diffsbdd/ReferencePickerHeading.tsx",
    "frontend/src/diffsbdd/ReferencePicker.css",
    "frontend/src/diffsbdd/ReferencePickerUpload.test.tsx",
    "server_tests/test_material_sources_browser.py",
}
FILES = SOURCES | {
    "scripts/material-input-scope.py",
    "tests/test_material_input_scope.py",
    ".github/workflows/reference-input-checks.yml",
    "docs/quality/frontend-coverage.md",
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


if __name__ == "__main__":
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
        output.write(
            "material_only="
            + str(selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )
