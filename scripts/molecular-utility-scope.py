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


RUNTIME_SOURCES = {
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/RuntimeSwitch.tsx",
    "frontend/src/utilities/backend-runtime.ts",
    "frontend/src/utilities/runtime-switch.css",
    "src/opendde_workbench/runtime_controls.py",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_utility_tools.py",
}
RUNTIME_CONSUMERS = {
    "frontend/src/App.tsx": (
        "a67ca642b1f1f16c602a4b54751b4e974af7e73bf8ab4b0992e64b1a5ab0e60d",
        "fa8cbe4d251738cd2b63a6a72ae33cad1b3d72c678df593b13cb86b364ed6959",
    ),
    "frontend/src/studio/ModuleTaskPicker.tsx": (
        "ae4f908bb75c8cb88d725a3109f43c6c0a07635699bee260abf2053c9773516b",
        "52d1d23a160d3cd63f2fcd9e5ffa0d2d578ee0a5721976337efa48acdfd9e8bf",
    ),
    "frontend/src/studio/EnvironmentWorkspace.tsx": (
        "1a26e737282dcfe9f98a593c92b074b05a348737cb725281292a71de924ea710",
        "62b095917680a277682be3938f571cfd3c91b337562a34dcd206ed1213e08843",
    ),
    "frontend/src/studio/TaskWorkspace.tsx": (
        "83865332f63e2b1ae24db14d97c9e1051d806a22b362e8ecfc68399f72d89e45",
        "66d3bfea053609e35bc89b62c624e40b3b84b3cc303a921fb36166a8999917d6",
    ),
    "frontend/src/utilities/UtilityTask.tsx": (
        "6b47ed44278476bd7a76cfc776b320bb7a0f05e8ccdbca7c26d7a4ae1977aa59",
        "c4b99fa6a33a0a1fd02ffd8ce4eb78a4a0ae9fe8c911fbff712f1a79977c7b01",
    ),
    "frontend/src/utilities/UtilityWorkspace.tsx": (
        "2c1f2199178eda58018dfa7eb8d753e9bac12626b56491e9d539ee549164a84b",
        "568d226c4a34f3c2d377d1061a0015296356bd35647ff2cdc76fd5c9f0a0f91c",
    ),
    "frontend/src/workflows/WorkflowCenter.tsx": (
        "8993326fc3e7e4de38712ca50a9c1a21a9a001dfb077672425f80f795bd3e7b0",
        "4ba53c4f35809f75112d9129f4de4c4816934f9cc4404a2da4a1602569bdffbd",
    ),
    "frontend/src/regions/RegionWorkspace.tsx": (
        "ac4ce9a209a8abf8879255cfe2f4e3f0f584f15d29aab1985c95517ad86fbff6",
        "dd7d9cd06d670a48cfe67aee3acf01f74bd0b2054a1b325389419bd40c531b85",
    ),
    "frontend/src/poses/PosePlanRun.tsx": (
        "78cabb945dfc52837ba9cb5616317fa69926369f2df1d0f7a75a0951e85cf160",
        "32979cd160c301e1383e4ce5503acce05de414544d7cc427ead012ea482e230a",
    ),
    "frontend/src/viewer/PoseOptimizationControls.tsx": (
        "5664d3c54850e50269ae7857d02a6df16b52f27615e67df105cc4154c24c9f9f",
        "83d2ef24d29d3f8a19ed8e2f3c801c32c8d4e39dfc8acd73b6036dd62172cc47",
    ),
    ".github/workflows/molecular-utility-checks.yml": (
        "7de71cac940b3fbd8d70eb6fc5faf284df93ba02d5e1c267f00291c9ed0f1680",
        "34e2b027b00542d62b4cfbd0cd5c185f72bc5529bc1e33fe0a254d5a286626bf",
    ),
    ".github/workflows/navigation-shell-checks.yml": (
        "f8f88be2979d908c91ed3e0ec11bb9a95d28637391015016729c5a31105b4714",
        "e9a7aa46015ee3254e76ce08a5baf624af4fa1687244dda7fa4c1f2f508534cf",
    ),
    ".github/workflows/pose-cluster-checks.yml": (
        "d2724846cc676161c9c60ca397aefa975cd2c2c16ee5d58fd3b14c3202bd0aa6",
        "7c2bc6dbff82e104afefccd091e29ee5a282ad45e934bc86d00305d3a040eaf6",
    ),
    ".github/workflows/workflow-quality-checks.yml": (
        "926835f53ece261bae8f45c895d8d5464f6763731f9f35041e495ed9cb509465",
        "6be8c7e359435b8ddd678b1197f7b365bfdcb37c86d538b5e4590dbfcb525efd",
    ),
}
RUNTIME_FILES = RUNTIME_SOURCES | RUNTIME_CONSUMERS.keys() | {
    "scripts/molecular-utility-scope.py",
    "tests/test_molecular_utility_scope.py",
    "frontend/src/poses/PosePlanRun.test.tsx",
    "frontend/src/viewer/PreviewAvailability.test.tsx",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}

RESULT_HEADER_BLOBS = {
    "frontend/src/App.tsx": (
        "42445698be60911b83d673f11503e2fb6ce3f26e", "f6a6e8346355c7771ef5bd7c35107caeda162561",
    ),
    "frontend/src/TaskDetail.tsx": (
        "64b947d1305eccaac11e5bc51ef671bc5f04fe3b", "14d108ba16091a3ef1b1cae88c4ae57d8196b2e6",
    ),
    "frontend/src/studio/TaskWorkspace.tsx": (
        "f0c2fb0034f48efd0a27c27999671939948087bd", "e1810976b781f881f9f12daaf16c64ced200d020",
    ),
    "frontend/src/studio/PredictionResults.tsx": (
        "50e043cd8a82aff79b37244f4162a02ad8861542", "530cfed4e314412829ddda5b8aa0d46d3814d428",
    ),
    "frontend/src/studio/task-history.css": (
        "4937a0b7170a6fb5ed5976dfca0abf2afc9931de", "3cf1e4feae1bbf900518a426cd1123a4b0712861",
    ),
    "frontend/src/presentation/prediction-result-header.css": (
        "0c5c46e45334cc4478c1d9ee8f5437d6c65b01c1", "54bf12ec295c4bf1246d4585706ad5ef9b3cf93d",
    ),
    "frontend/src/diffsbdd/DiffResults.tsx": (
        "18d3c93ed00da60a12f2c2f00295ccb301c42d93", "03e712863f54604e88e8a729aeceea6c2e64efd5",
    ),
    "frontend/src/diffsbdd/GeneratedCandidates.tsx": (
        "dcab766617a2523fa8b294b9c77104e1a923911d", "0ea6dc4989d0a11a4ce07e714ea6cbf78f5fb58b",
    ),
    "frontend/src/diffsbdd/GeneratedMetricsView.tsx": (
        "bc0135365d77460924ea6111b414c3c8661dbd24", "a87145059e99732e1fec23f62236c4fc0f0e9ff8",
    ),
    "frontend/src/presentation/CandidateReviewBar.tsx": (
        "aa11bf8016090ffa41bbdd50281b4d9e01f6e2f5", "9a9f14c6a35a6f357c3f7661e90498d518d1c8b7",
    ),
    "frontend/src/presentation/candidate-review-bar.css": (
        "778b4bb22cf034c5a3e052f49c34de1a4883c265", "42f13fb28e45ff13424634a60c7c5c3cf53e375b",
    ),
}
RESULT_HEADER_FILES = RESULT_HEADER_BLOBS.keys() | {
    "frontend/src/studio/TaskWorkspace.test.tsx",
    "frontend/src/diffsbdd/DiffResults.test.tsx",
    "frontend/src/diffsbdd/GeneratedCandidates.test.tsx",
    "server_tests/test_generated_quality_browser.py",
    "scripts/molecular-utility-scope.py",
    "tests/test_molecular_utility_scope.py",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/generated-candidate-checks.yml",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def result_header_selected(changed, event, *, blobs):
    paths = set(changed)
    return (
        event in {"push", "pull_request"}
        and paths <= RESULT_HEADER_FILES
        and RESULT_HEADER_BLOBS.keys() <= paths
        and all(blobs.get(path) == pair for path, pair in RESULT_HEADER_BLOBS.items())
    )


def runtime_selected(changed, event, *, shared):
    paths = set(changed)
    return (
        event in {"push", "pull_request"}
        and bool(paths & RUNTIME_SOURCES)
        and paths <= RUNTIME_FILES
        and all(shared.get(path) == RUNTIME_CONSUMERS[path]
                for path in paths & RUNTIME_CONSUMERS.keys())
    )


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


def git_blob(revision, path):
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{revision}:{path}"],
        capture_output=True, text=True, check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", base, "HEAD"], text=True
    ).splitlines() if base and set(base) != {"0"} else []
    touch_paths = {
        "frontend/src/utilities/image-molecule.css",
        "server_tests/test_utility_image_browser.py",
    }
    touch_controls = (
        os.environ.get("GITHUB_EVENT_NAME") in {"push", "pull_request"}
        and bool(set(changed) & touch_paths)
        and set(changed)
        <= touch_paths
        | {
            "scripts/molecular-utility-scope.py",
            ".github/workflows/molecular-utility-checks.yml",
            "pyproject.toml",
            "uv.lock",
            "frontend/package.json",
            "frontend/package-lock.json",
            "install.sh",
            "install.ps1",
        }
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("touch_controls_only=" + str(touch_controls).lower() + "\n")
        event = os.environ.get("GITHUB_EVENT_NAME", "push")
        shared_paths = SHARED.keys()
        if set(changed) & RUNTIME_SOURCES:
            shared_paths = shared_paths | RUNTIME_CONSUMERS.keys()
        shared = {
            path: (blob_digest(base, path), blob_digest("HEAD", path))
            for path in set(changed) & shared_paths
        }
        runtime = runtime_selected(changed, event, shared=shared)
        layout = result_header_selected(changed, event, blobs={
            path: (git_blob(base, path), git_blob("HEAD", path))
            for path in set(changed) & RESULT_HEADER_BLOBS.keys()
        })
        utility = runtime or layout or selected(changed, event, shared=shared)
        output.write("runtime_switch_only=" + str(runtime).lower() + "\n")
        output.write("result_header_only=" + str(layout).lower() + "\n")
        output.write("utility_only=" + str(utility).lower() + "\n")


if __name__ == "__main__":
    main()
