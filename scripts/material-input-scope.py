"""Closed delegation for shared material presentation and source lifecycle."""

import os
import subprocess

SOURCES = {
    "frontend/src/operations/AssetPicker.tsx",
    "frontend/src/operations/AssetPicker.test.tsx",
    "frontend/src/operations/AssetPickerSources.ts",
    "frontend/src/operations/AssetPickerUpload.tsx",
    "frontend/src/operations/AssetPickerSources.test.tsx",
    "frontend/src/operations/PropertyForm.tsx",
    "frontend/src/operations/PropertyFormFileVerification.test.tsx",
    "frontend/src/operations/PropertyForm.test.tsx",
    "server_tests/test_molecular_material_browser.py",
    "server_tests/test_generic_input_browser.py",
    "server_tests/material_capture.py",
    "frontend/src/research/SequencePicker.tsx",
    "frontend/src/research/SequencePickerRetention.test.tsx",
    "frontend/src/research/SequenceTextInput.tsx",
    "frontend/src/research/useSequenceSources.ts",
    "frontend/src/research/MaterialInput.tsx",
    "frontend/src/research/material-input.css",
    "frontend/src/diffsbdd/ReferencePicker.tsx",
    "frontend/src/diffsbdd/ReferencePickerHeading.tsx",
    "frontend/src/diffsbdd/ReferencePicker.css",
    "frontend/src/diffsbdd/ReferencePickerUpload.test.tsx",
    "server_tests/test_material_sources_browser.py",
    "server_tests/test_sequence_material_browser.py",
}
LAYOUT = ".github/workflows/task-layout-checks.yml"
DELEGATED = (
    "frontend/src/research/MaterialInput*",
    "frontend/src/research/material-input.css",
    "frontend/src/research/SequenceTextInput*",
    "frontend/src/research/useSequenceSources*",
)
FILES = SOURCES | {
    LAYOUT,
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


def delegated_layout(before, after):
    """Only add the four exact exclusions owned by this input workflow."""
    marker = '      - "!frontend/src/research/SequencePicker*"\n'
    return (
        bool(before)
        and before.count(marker) == 1
        and after
        == before.replace(marker, marker + "".join(f'      - "!{path}"\n' for path in DELEGATED))
    )


def selected(changed, event="push", *, layout_before="", layout_after=""):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and bool(changed & SOURCES)
        and changed <= FILES
        and (LAYOUT not in changed or delegated_layout(layout_before, layout_after))
    )


def from_git(revision, path):
    try:
        return subprocess.check_output(
            ["git", "show", f"{revision}:{path}"], text=True, stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        return ""


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
            + str(
                selected(
                    changed,
                    os.environ.get("GITHUB_EVENT_NAME", "push"),
                    layout_before=from_git(base, LAYOUT) if LAYOUT in changed else "",
                    layout_after=from_git("HEAD", LAYOUT) if LAYOUT in changed else "",
                )
            ).lower()
            + "\n"
        )
