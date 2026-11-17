"""Keep contact-row presentation on its exact saved-result and native-view checks."""

import os
import subprocess

EPITOPE_SOURCES = {
    "frontend/src/operations/EpitopeResults.tsx",
    "frontend/src/operations/EpitopeResults.test.tsx",
    "frontend/src/operations/EpitopeWorkspace.test.tsx",
    "frontend/src/operations/EpitopeContactList.tsx",
    "frontend/src/operations/epitope.css",
    "server_tests/test_epitope_workspace_browser.py",
}
EPITOPE_SHARED = {
    "frontend/src/integrations/interaction-workspace.css",
    "frontend/src/integrations/interaction-residue.ts",
    "frontend/src/integrations/interaction-residue.test.ts",
    "server_tests/interaction_workspace_case.py",
}
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
} | EPITOPE_SOURCES
FILES = SOURCES | {
    "scripts/interaction-workspace-scope.py",
    "tests/test_interaction_workspace_scope.py",
    "scripts/protein-interface-scope.py",
    "tests/test_protein_interface_scope.py",
    ".github/workflows/protein-interface-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    "docs/frontend-layout.md",
    "pyproject.toml", "uv.lock", "frontend/package.json", "frontend/package-lock.json",
    "install.sh", "install.ps1",
}


def selected(changed, event="push"):
    changed = set(changed)
    return event in {"push", "pull_request"} and bool(changed & SOURCES) and changed <= FILES


def epitope_only(changed, event="push"):
    changed = set(changed)
    return selected(changed, event) and bool(changed & EPITOPE_SOURCES) and not (
        changed & (SOURCES - EPITOPE_SOURCES)
    )


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
    value = selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("interaction_only=" + str(value).lower() + "\n")
        output.write("epitope_only=" + str(epitope_only(
            changed, os.environ.get("GITHUB_EVENT_NAME", "push")
        )).lower() + "\n")
        output.write("epitope_changed=" + str(bool(
            set(changed) & (EPITOPE_SOURCES | EPITOPE_SHARED)
        )).lower() + "\n")


if __name__ == "__main__":
    main()
