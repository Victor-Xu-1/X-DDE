"""Select direct consumers for immutable case data and verified native source aliases."""

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
    "tests/test_stat6_source_revisions.py",
    "tests/test_study_module_revisions.py",
    "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
    "src/opendde_workbench/examples/stat6/module-revisions.json",
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

RECEPTOR_CORE = {
    "src/opendde_workbench/examples/receptor_provenance.py",
    "src/opendde_workbench/examples/supporting.py",
    "src/opendde_workbench/examples/stat6/preparation.py",
}
RECEPTOR_TEST = "tests/test_receptor_case_aliases.py"
RECEPTOR_PATHS = {
    *RECEPTOR_CORE,
    RECEPTOR_TEST,
    "src/opendde_workbench/examples/stat6_bundle_release.py",
    "tests/test_reviewed_stat6_case_data.py",
    "tests/test_rgroup_reviewed_case_data.py",
    "tests/stat6_original_port_case.py",
    "server_tests/test_rgroup_reviewed_stages_browser.py",
    ".github/workflows/example-result-set-checks.yml",
    "docs/reviewed-example-data.md",
    "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
    "src/opendde_workbench/examples/stat6/module-revisions.json",
    "tests/test_study_module_revisions.py",
    "scripts/case-data-scope.py",
    "scripts/antibody_template_scope.py",
    "tests/ci/test_case_data_scope.py",
    ".github/workflows/stat6-template-checks.yml",
    ".github/workflows/module-example-checks.yml",
    ".github/workflows/examples-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    ".github/workflows/workflow-quality-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/antibody-cdr-input-checks.yml",
    "docs/design/research-examples.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def native_receptor_only(changed):
    changed = set(changed)
    return RECEPTOR_CORE <= changed and RECEPTOR_TEST in changed and changed <= RECEPTOR_PATHS


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
        native = os.environ.get(
            "GITHUB_EVENT_NAME"
        ) != "workflow_dispatch" and native_receptor_only(changed)
        output.write("native_receptor_only=" + str(native).lower() + "\n")


if __name__ == "__main__":
    main()
