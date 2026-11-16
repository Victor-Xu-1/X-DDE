"""Keep editor-only presentation changes on the native editor's direct gates."""

import os
import subprocess

SOURCES = {
    "frontend/src/editors/Editors.tsx",
    "frontend/src/editors/EditorCommands.tsx",
    "frontend/src/editors/editors.css",
    "frontend/src/editors/drawing-visibility.ts",
    "frontend/src/editors/AlignedEditAction.tsx",
    "frontend/src/editors/AlignedEditAction.test.tsx",
    "server_tests/test_editor_workspace_layout_browser.py",
}
FILES = SOURCES | {
    "scripts/editor-layout-scope.py", "tests/test_editor_layout_scope.py",
    ".github/workflows/ketcher-depiction-checks.yml",
    ".github/workflows/task-readiness-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    "docs/frontend-layout.md", "pyproject.toml", "uv.lock",
    "frontend/package.json", "frontend/package-lock.json", "install.sh", "install.ps1",
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
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", base, "HEAD"], text=True
    ).splitlines() if base and set(base) != {"0"} else []
    value = selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        stream.write(f"editor_layout_only={str(value).lower()}\n")
    print({"editor_layout_only": value, "changed": changed})


if __name__ == "__main__":
    main()
