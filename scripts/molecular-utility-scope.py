"""Delegate closed molecular-utility changes; preserve mixed scientific gates."""

import hashlib
import os
import subprocess
from pathlib import Path

SOURCES = {
    "frontend/src/editors/ketcher-conversions.ts",
    "frontend/src/editors/ketcher-conversions.test.ts",
    "frontend/src/utilities/ImageInputSource.ts",
    "frontend/src/utilities/UtilityImageInput.tsx",
    "frontend/src/utilities/UtilityImageTask.test.tsx",
    "frontend/src/utilities/useRecognitionRequest.ts",
    "frontend/src/utilities/useRecognitionRequest.test.tsx",
    "frontend/src/utilities/useRecognitionBridge.ts",
    "frontend/src/utilities/recognition-host-bridge.ts",
    "frontend/src/utilities/recognition-host-foreground.test.ts",
    "frontend/src/utilities/recognition-foreground.ts",
    "frontend/src/utilities/recognition-foreground.test.ts",
    "frontend/src/utilities/image-molecule.ts",
    "frontend/src/utilities/image-molecule.css",
    "frontend/src/operations/AssetPickerImageSource.test.tsx",
    "src/opendde_workbench/recognition_companion.py",
    "src/opendde_workbench/data/recognition_locale/patch.json",
    "tests/test_recognition_companion.py",
    "tests/test_recognition_companion_wheel.py",
    "tests/fixtures/utility_image/browser.tsx",
    "server_tests/test_utility_image_browser.py",
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
    "frontend/src/diffsbdd/ReferencePicker.tsx",
    "frontend/src/diffsbdd/useReferenceSelection.ts",
    "frontend/src/operations/AssetPicker.tsx",
    "frontend/src/operations/AssetPickerSources.ts",
    "frontend/src/operations/AssetPickerUpload.tsx",
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
    "frontend/src/diffsbdd/ReferencePicker.tsx": (
        "49c134e27c14e1964dc2774f2de7ba29bf0497881c30095e6f046e1a0b4f4899",
        "125932d3a7938b0b13eca0bcd5cd2eb81cf66f726852cb6d4ae584346f13e173",
    ),
    "frontend/src/diffsbdd/useReferenceSelection.ts": (
        "aaca98c7a1a2173090823cf9311deb49aca29e2024f934659b675e32af3c0e3e",
        "a9c90520d5d6b209ac537aac72abc5fa845bcabf4a4ef275dc14eebb580c46c3",
    ),
    "frontend/src/operations/AssetPicker.tsx": (
        "eab741b5bea40e29cabb335015af70e0a50f7d83495168baf5c52f6e1e300cc4",
        "86b68179142d60498ff357bcfa9a763940550e3ecebcbd2d2de20ca2d97c5a88",
    ),
    "frontend/src/operations/AssetPickerSources.ts": (
        "6600b5d4691bd44da03f3ea326e9e459751e876bb50b5b329bb62baaacce0a59",
        "733ec1ffc0655a2c1e0aa3fab4c0a6641b2340e8c5a94317ac45b74e4bcb2c55",
    ),
    "frontend/src/operations/AssetPickerUpload.tsx": (
        "5821cfb031dbd0d95f354269fa697813e73e253eaaa9dda92dec30b10b9775c7",
        "d83da569918b69e3d3aa56eab4b7bf74934d3c0c52e5eee0a30e481ba1d732e6",
    ),
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
