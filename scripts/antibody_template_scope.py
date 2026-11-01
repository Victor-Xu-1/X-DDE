"""Delegate only a bounded CDR-input batch to its focused native/source/browser gate."""

import fnmatch
import os
import runpy
import subprocess
from pathlib import Path

CORE = {
    "src/opendde_workbench/examples/stat6/antibody_cdr_inputs.py",
    "frontend/src/examples/antibody-inputs.ts",
}
SOURCE_REGRESSIONS = {
    "tests/test_harness_sequences.py",
    "frontend/src/examples/harness.test.ts",
    "frontend/src/examples/antibody-inputs.test.ts",
}
PATHS = (
    *CORE,
    "src/opendde_workbench/examples/stat6/antibody_structure_input.py",
    "src/opendde_workbench/examples/stat6/preparation.py",
    "src/opendde_workbench/examples/stat6/requests.py",
    "src/opendde_workbench/examples/stat6/harness_requests.py",
    "src/opendde_workbench/examples/stat6/guidance.py",
    "src/opendde_workbench/examples/stat6/module-revisions.json",
    "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
    "frontend/src/examples/harness.ts",
    "frontend/src/examples/harness.test.ts",
    "src/opendde_workbench/harness_sequences.py",
    "src/opendde_workbench/harness_chains.py",
    "src/opendde_workbench/harness_msa.py",
    "tests/test_harness_sequences.py",
    "tests/test_harness_msa.py",
    "frontend/src/operations/HarnessField.tsx",
    "frontend/src/operations/candidate-sequence-model.ts",
    "frontend/src/operations/HarnessCdrInputs.test.tsx",
    "frontend/src/examples/antibody-inputs.test.ts",
    "tests/antibody_cdr_case.py",
    "tests/test_antibody_cdr_inputs.py",
    "tests/test_study_module_revisions.py",
    "tests/test_reviewed_stat6_case_data.py",
    "tests/fixtures/stat6/antibody_cdr/*",
    "tests/ci/test_antibody_template_scope.py",
    "server_tests/test_native_antibody_cdr_gate.py",
    "server_tests/test_antibody_cdr_template_browser.py",
    "server_tests/test_fold_msa_sources_browser.py",
    "server_tests/test_native_fold_chain_contract.py",
    "scripts/antibody_template_scope.py",
    "scripts/check-fold-source-baseline.py",
    ".github/workflows/antibody-cdr-input-checks.yml",
    ".github/workflows/harness-checks.yml",
    ".github/workflows/stat6-template-checks.yml",
    ".github/workflows/examples-checks.yml",
    ".github/workflows/module-example-checks.yml",
    ".github/workflows/study-module-revision-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    ".github/workflows/defined-site-checks.yml",
    ".github/workflows/workflow-quality-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/publication-checks.yml",
    "docs/research/stat6-study.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
)


def selected(changed):
    relevant = bool(CORE.intersection(changed)) or SOURCE_REGRESSIONS.issubset(changed)
    return relevant and all(
        any(fnmatch.fnmatchcase(path, pattern) for pattern in PATHS) for path in changed
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
    native_scope = runpy.run_path(str(Path(__file__).with_name("case-data-scope.py")))[
        "native_receptor_only"
    ]
    native = os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" and native_scope(changed)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("antibody_only=" + str(selected(changed)).lower() + "\n")
        output.write("native_receptor_only=" + str(native).lower() + "\n")
    print("CDR input delegation:", selected(changed), "changed files:", len(changed))


if __name__ == "__main__":
    main()
