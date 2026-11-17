"""Delegate closed molecular-utility changes; preserve mixed scientific gates."""

import os
import hashlib
import subprocess
from pathlib import Path

SOURCES = {
    "frontend/src/guided/TaskPresentation.tsx",
    "frontend/src/guided/SinglePageFields.tsx",
    "frontend/src/guided/SinglePageTask.test.tsx",
    "frontend/src/utilities/UtilitySinglePage.test.tsx",
    "frontend/src/utilities/UtilityTaskResult.tsx",
    "frontend/src/utilities/UtilityTaskResult.test.tsx",
    "frontend/src/utilities/ImageMoleculeInput.tsx",
    "frontend/src/utilities/ImageMoleculeDialog.tsx",
    "frontend/src/utilities/ImageMoleculeInput.action.test.tsx",
    "frontend/src/utilities/useImageInputSession.ts",
    "server_tests/molecular_review_capture.py",
    "frontend/src/guided/MolecularReview.tsx",
    "frontend/src/guided/InputActionScope.tsx",
    "frontend/src/guided/useInputTaskSubmit.ts",
    "frontend/src/guided/molecular-review.css",
    "frontend/src/operations/PropertyForm.tsx",
    "frontend/src/chemistry/StateForm.tsx",
    "frontend/src/chemistry/LibraryScreenForm.tsx",
    "frontend/src/chemistry/LibraryScreenQuestions.tsx",
    "src/opendde_workbench/examples/pin_validation.py",
    "frontend/src/admet/AdmetForm.tsx",
    "frontend/src/admet/AdmetResults.tsx",
    "frontend/src/admet/AdmetSettings.tsx",
    "frontend/src/utilities/UtilityTask.tsx",
    "frontend/src/utilities/utility-task.css",
    "frontend/src/utilities/UtilityTask.test.tsx",
    "frontend/src/utilities/UtilityBrainSubmission.test.tsx",
    "frontend/src/admet/BrainScope.test.tsx",
    "frontend/src/admet/BrainScope.tsx",
    "frontend/src/admet/EndpointTable.tsx",
    "frontend/src/admet/types.ts",
    "frontend/src/operations/ToolCenter.tsx",
    "frontend/src/operations/catalog.ts",
    "frontend/src/studio/method-choices.ts",
    "frontend/src/studio/research-modules.ts",
    "frontend/src/studio/task-kind-rules.ts",
    "frontend/src/utilities/UtilityWorkspace.test.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "server_tests/test_brain_profile_browser.py",
    "server_tests/utility_workspace_capture.py",
    "src/opendde_workbench/admet/contract.py",
    "src/opendde_workbench/admet/presentation.py",
    "src/opendde_workbench/capabilities/definitions.py",
    "src/opendde_workbench/capabilities/modalities.py",
    "src/opendde_workbench/examples/catalogue.json",
    "src/opendde_workbench/examples/preparation.py",
    "src/opendde_workbench/examples/stat6/catalogue-profiles.json",
    "src/opendde_workbench/examples/stat6/guidance.py",
    "src/opendde_workbench/examples/stat6/task_requests.py",
    "src/opendde_workbench/task_history/kinds.py"
}
# These paths are accepted only as removals during the canonical gate migration.
RETIRED = {
    ".github/workflows/brain-profile-checks.yml",
    "scripts/brain-profile-scope.py",
    "tests/test_brain_profile_scope.py",
    "frontend/src/admet/brain.css",
    "frontend/src/admet/BrainForm.tsx",
    "frontend/src/admet/BrainForm.test.tsx",
}
FILES = SOURCES | RETIRED | {
    "frontend/src/App.tsx",
    "frontend/src/guided/Questionnaire.tsx",
    "frontend/src/guided/GuidedQuestionFields.tsx",
    ".github/workflows/appearance-checks.yml",
    ".github/workflows/chart-quality-checks.yml",
    ".github/workflows/landscape-checks.yml",
    ".github/workflows/simulation-view-checks.yml",
    ".github/workflows/viewer-checks.yml",
    ".github/workflows/task-service-availability.yml",
    "frontend/src/examples/ExampleActions.tsx",
    "frontend/src/examples/ExampleActions.test.tsx",
    ".github/workflows/library-screen-checks.yml",
    ".github/workflows/reference-input-checks.yml",
    "frontend/src/guided/MolecularReview.test.tsx",
    "frontend/src/chemistry/MolecularToolReview.test.tsx",
    "server_tests/test_molecular_review_workspace_browser.py",
    ".github/workflows/example-result-set-checks.yml",
    ".github/workflows/admet-inspection-checks.yml",
    ".github/workflows/antibody-cdr-input-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/defined-site-checks.yml",
    ".github/workflows/examples-checks.yml",
    ".github/workflows/module-example-checks.yml",
    ".github/workflows/pocket-result-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/pose-handoff-checks.yml",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/research-material-checks.yml",
    ".github/workflows/restraint-guidance-checks.yml",
    ".github/workflows/simulation-questionnaire-checks.yml",
    ".github/workflows/stat6-preparation-checks.yml",
    ".github/workflows/stat6-template-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/task-history-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/task-readiness-checks.yml",
    ".github/workflows/task-status-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/utility-tools-checks.yml",
    "docs/frontend-layout.md",
    "frontend/package-lock.json",
    "frontend/package.json",
    "install.ps1",
    "install.sh",
    "pyproject.toml",
    "scripts/molecular-utility-scope.py",
    "scripts/record-study-catalogue.py",
    "tests/test_brain_profile.py",
    "tests/test_molecular_utility_scope.py",
    "tests/test_stat6_predicted_references.py",
    "tests/test_study_module_revisions.py",
    "uv.lock"
}


# Exact reviewed transitions only; unknown shared-shell changes retain native gates.
# Values are bound to Git blob bytes and updated only with independent source review.
SHARED = {
    "frontend/src/App.tsx": (
        "3cf9036e6351d2f0571b3e2317686083422f661c140ec405003134af1f63c728",
        "a67ca642b1f1f16c602a4b54751b4e974af7e73bf8ab4b0992e64b1a5ab0e60d",
    ),
    "frontend/src/guided/Questionnaire.tsx": (
        "2416d834416a19cbdd65ff43256ec661d8fd14afd4353d0782f6153c88f5e8a1",
        "895c527d11cd1bf9a17743a9ad8b3dcb3258728b779651cb71b2c71a265e35c5",
    ),
    "frontend/src/guided/GuidedQuestionFields.tsx": (
        None, "7f3752d3f7d11f762e0b240628c406551a91a1e45aca0d2e8d25f6dc51686206",
    ),
}


def selected(changed, event="push", *, shared=None):
    paths = set(changed)
    if any(Path(path).exists() for path in paths & RETIRED):
        return False
    for path in paths & SHARED.keys():
        if not shared or shared.get(path) != SHARED[path]:
            return False
    return event in {"push", "pull_request"} and bool(paths & SOURCES) and paths <= FILES


def blob_digest(revision, path):
    try:
        value = subprocess.check_output(
            ["git", "show", f"{revision}:{path}"], stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        return None
    return hashlib.sha256(value).hexdigest()


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", base, "HEAD"], text=True
    ).splitlines() if base and set(base) != {"0"} else []
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("utility_only=" + str(selected(
            changed, os.environ.get("GITHUB_EVENT_NAME", "push"),
            shared={path: (blob_digest(base, path), blob_digest("HEAD", path))
                    for path in set(changed) & SHARED.keys()},
        )).lower() + "\n")


if __name__ == "__main__":
    main()
