"""Keep a reviewed model-evidence batch on model and shared-consumer checks."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "src/opendde_workbench/integrations/property_models.py",
    "src/opendde_workbench/integrations/bindings.py",
    "src/opendde_workbench/integrations/routes.py",
    "frontend/src/integrations/PropertyModel*",
    "frontend/src/integrations/property-model-evidence*",
    "frontend/src/integrations/ScientificReview.tsx",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/integrations/types.ts",
    "tests/test_property_model_context.py",
    "tests/test_property_model_scope.py",
    "tests/test_model_case_sources.py",
    "server_tests/test_property_model_reuse_browser.py",
    "scripts/property-model-scope.py",
    "docs/stat6-spr-model-baseline.md",
    ".github/workflows/property-model-review-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/landscape-checks.yml",
    ".github/workflows/defined-site-checks.yml",
    ".github/workflows/molecule-design-review-checks.yml",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def selected(changed, event="push"):
    return (
        event in {"push", "pull_request"}
        and bool(changed)
        and any(
            "PropertyModel" in path or "property_model" in path or "property-model-evidence" in path
            for path in changed
        )
        and all(any(fnmatch.fnmatchcase(path, rule) for rule in PATTERNS) for path in changed)
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
        if base and set(base) != {"0"}
        else []
    )
    value = selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        stream.write("model_context_only=" + str(value).lower() + "\n")


if __name__ == "__main__":
    main()
