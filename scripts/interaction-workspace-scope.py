"""Route exact saved-reference or contact changes to their native-view checks."""

import os
import subprocess

SOURCES = {
    "frontend/src/integrations/InteractionResults.tsx",
    "frontend/src/integrations/InteractionResults.test.tsx",
    "frontend/src/integrations/ProteinInterfaceResults.tsx",
    "frontend/src/integrations/ProteinInterfaceResults.test.tsx",
    "frontend/src/integrations/ProteinInterfaceContacts.tsx",
    "frontend/src/integrations/interaction-residue.ts",
    "frontend/src/integrations/interaction-residue.test.ts",
    "frontend/src/integrations/interaction-workspace.css",
    "server_tests/test_interaction_workspace_browser.py",
    "server_tests/test_protein_interface_workspace_browser.py",
    "server_tests/interaction_workspace_case.py",
}
FILES = SOURCES | {
    "scripts/interaction-workspace-scope.py",
    "tests/test_interaction_workspace_scope.py",
    "scripts/protein-interface-scope.py",
    "tests/test_protein_interface_scope.py",
    ".github/workflows/protein-interface-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml", "uv.lock", "frontend/package.json", "frontend/package-lock.json",
    "install.sh", "install.ps1",
}

REFERENCE_SOURCES = {
    "frontend/src/discovery/ReferenceImportResults.tsx",
    "frontend/src/discovery/ReferenceImportResults.test.tsx",
    "frontend/src/discovery/ReferenceArchivePreview.tsx",
    "frontend/src/discovery/reference-import.css",
    "frontend/src/presentation/MoleculeImage.tsx",
    "frontend/src/presentation/MoleculeImage.test.tsx",
    "frontend/src/presentation/depiction-renderer.ts",
    "frontend/src/presentation/depiction-renderer.test.ts",
    "frontend/src/viewer/structure-bytes.ts",
    "frontend/src/viewer/structure-bytes.test.ts",
    "server_tests/test_reference_preview_browser.py",
}
REFERENCE_FILES = REFERENCE_SOURCES | {
    "scripts/interaction-workspace-scope.py",
    "tests/test_interaction_workspace_scope.py",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/ketcher-depiction-checks.yml",
    ".github/workflows/workspace-preview-checks.yml",
    ".github/workflows/molecular-preview-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/viewer-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml", "uv.lock", "frontend/package.json", "frontend/package-lock.json",
    "install.sh", "install.ps1",
}


def reference_selected(changed, event="push"):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and bool(changed & REFERENCE_SOURCES)
        and changed <= REFERENCE_FILES
    )


def selected(changed, event="push"):
    changed = set(changed)
    return event in {"push", "pull_request"} and bool(changed & SOURCES) and changed <= FILES


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
        if base and set(base) != {"0"} else []
    )
    event = os.environ.get("GITHUB_EVENT_NAME", "push")
    reference = reference_selected(changed, event)
    value = selected(changed, event) or reference
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("interaction_only=" + str(value).lower() + "\n")
        output.write("reference_only=" + str(reference).lower() + "\n")


if __name__ == "__main__":
    main()
