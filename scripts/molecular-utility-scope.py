"""Delegate closed molecular-utility changes; preserve mixed scientific gates."""

import hashlib
import json
import os
import subprocess
from pathlib import Path
from runpy import run_path

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
    "frontend/src/examples/ExampleToolbar.tsx": (
        "b13790abbc7b64f138283d9ac351812185eb7148376e368d2233cec0ba228215",
        "c55ecbcff3494861746d707e9b2039105f028cbcbf00fa88c6f10478138963cc",
    ),
    "frontend/src/examples/ExampleActions.tsx": (
        "ffe7affa0018e2d9f19ec792134a1fa0ee8fabe1bc1a328109db95564d9ae8e3",
        "83466d5ad006912f10e63664095ae0920415fad215416feb2cda1de0b1c65a70",
    ),
    "frontend/src/utilities/UtilityTask.tsx": (
        "c4b99fa6a33a0a1fd02ffd8ce4eb78a4a0ae9fe8c911fbff712f1a79977c7b01",
        "cbe222c82c91a270d42e0ea3cf17f7355f785379ac38f6884050cdba23951e88",
    ),
    "frontend/src/examples/ExampleActions.test.tsx": (
        "b7a84d002b300d4b4a63b48da5e833af67d392202fcec75d1761d7a351dd6194",
        "a7bf8b36d4dbebda57e4af7da14670559f9118b4341e1e1ef3364647b9e955f5",
    ),
    "frontend/src/examples/guide-data.json": (
        "6884cc87a96277d58f45d27f37735adaa545603deb431628719d1b5ed789c608",
        "90d130ab70a8ab7a4959fc710c86e28c96eb780dfcaee8bded56f08023847ac2",
    ),
    "frontend/src/studio/HomeWorkspace.tsx": (
        "fdaf5feebb8468d9ae1ce222a96ded35e99f9007e377c905b3abe57acbedc787",
        "b229d77b830c4b382dac24dd9fc0e5bea4063231f9ea71a2a871cda5ce757ccb",
    ),
    "frontend/src/studio/HomeWorkspace.test.tsx": (
        "ddb9d6f34c9764f4cbbe7b70bd8513c830fa2b18a89ca7803a39410c3109ec95",
        "2959aa084eb8b4d54bc60720e7e62184618afb2baf5d6d064a174b9ddbe91d42",
    ),
    "src/opendde_workbench/discovery/routes.py": (
        "a3ebc5c97b74a564ac65291492da27d21b6456f8b696813d17aab10eec4a1e7f",
        "dd71fdff10786d29e40c166243d5c88f0e363c82994c1f67484203baf2b391c7",
    ),
    "frontend/src/discovery/TargetResearchForm.tsx": (
        "a4bd9a9117b8627e03da18689eca34cad94464c3d4ff82e69af997707a010b20",
        "4c990a04722f252ef7f7075eba4011a647f32691445a346f571187bb0a3bbfed",
    ),
    "frontend/src/editors/AlignedEditAction.tsx": (
        "5e025a01830c94ba6e668f3fa0defacb59da4611e900ff8a4b62600afa5c3c6f",
        "a40c61ae0868bdb958a662e931378f3b1167721c4a8475b95e482bb176d67502",
    ),
    "frontend/src/operations/CovalentEditor.tsx": (
        "b30a0a5e2c16b618d932b714c6f88acb0d1a69aaafb9ca8fa780135c628b2b96",
        "607478e5d9252332af1fe53bcc033c8cbc2173a55530c0eca29dbb045a606fcd",
    ),
    "frontend/src/poses/PoseWorkspace.tsx": (
        "f1469bbcca582a8a23b8844b5883c1b5762a45a0b7fb36aa204ff8943323d2bd",
        "4052a3fe7736133f49738a8ce295626a8a8ce4ed2910f63cdd0e3594ae8df336",
    ),
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
    "frontend/src/utilities/UtilityWorkspace.tsx": (
        "2c1f2199178eda58018dfa7eb8d753e9bac12626b56491e9d539ee549164a84b",
        "568d226c4a34f3c2d377d1061a0015296356bd35647ff2cdc76fd5c9f0a0f91c",
    ),
    "frontend/src/workflows/WorkflowCenter.tsx": (
        "4ba53c4f35809f75112d9129f4de4c4816934f9cc4404a2da4a1602569bdffbd",
        "aba2775c6a6066e54467b1c8c14e4f75b31a1c2eef5635b8a6ad0eaa914e278a",
    ),
    "frontend/src/regions/RegionWorkspace.tsx": (
        "dd7d9cd06d670a48cfe67aee3acf01f74bd0b2054a1b325389419bd40c531b85",
        "0511a4fecba72251d7fd3f6e3c6a116a552a6cc16d9dd35bee2450760c552844",
    ),
    "frontend/src/poses/PosePlanRun.tsx": (
        "32979cd160c301e1383e4ce5503acce05de414544d7cc427ead012ea482e230a",
        "78cabb945dfc52837ba9cb5616317fa69926369f2df1d0f7a75a0951e85cf160",
    ),
    "frontend/src/viewer/PoseOptimizationControls.tsx": (
        "5664d3c54850e50269ae7857d02a6df16b52f27615e67df105cc4154c24c9f9f",
        "83d2ef24d29d3f8a19ed8e2f3c801c32c8d4e39dfc8acd73b6036dd62172cc47",
    ),
    ".github/workflows/molecular-utility-checks.yml": (
        "0c8cde23b65b925abc0cafcf11ee0371d16731150fd13ba60a5f9d3d2735a35b",
        "f601e414d64d716306875f9d9b6cd712e18c16e463bb2cf883a117cfde7b7e4b",
    ),
    ".github/workflows/ketcher-depiction-checks.yml": (
        "2c0c199e4aef580991ea84327e80fefdf2cd4cd75d66179c676947384a0b49df",
        "0f4beba05e0c07d022b3c6d169b01b1929ef359667a83aa5ab56b7fad776c4a0",
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
    "server_tests/test_result_handoff_browser.py",
    "scripts/molecular-utility-scope.py",
    "tests/test_molecular_utility_scope.py",
    "frontend/src/poses/PosePlanRun.test.tsx",
    "frontend/src/poses/PoseWorkspace.test.tsx",
    "frontend/src/discovery/TargetResearchForm.test.tsx",
    "frontend/src/editors/AlignedEditAction.test.tsx",
    "frontend/src/operations/CovalentEditor.test.tsx",
    "frontend/src/workflows/WorkflowCenter.test.tsx",
    "frontend/src/workflows/WorkflowBackendControl.tsx",
    "docs/user-guide.md",
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
    ".github/workflows/generated-candidate-checks.yml": (
        "c8b4b2de27da7e5e47b5ece263313e103cc4163d", "40f80ca4089490f4ed19c9b3447449362343c94e",
    ),
    ".github/workflows/molecular-utility-checks.yml": (
        "0aa487f5f8616a3c577628d5f89a1937c589135f", "e021671bbeb2bb882e819137a35ecf2ad7034d64",
    ),
}
RESULT_HEADER_FILES = RESULT_HEADER_BLOBS.keys() | {
    "frontend/src/studio/TaskWorkspace.test.tsx",
    "frontend/src/diffsbdd/DiffResults.test.tsx",
    "frontend/src/diffsbdd/GeneratedCandidates.test.tsx",
    "server_tests/test_generated_quality_browser.py",
    "scripts/molecular-utility-scope.py",
    "tests/test_molecular_utility_scope.py",
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


def blob_digest(revision, path, *, mask=b""):
    try:
        value = subprocess.check_output(
            ["git", "show", f"{revision}:{path}"], stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        return None
    if mask:
        value = value.replace(mask, b"", 1)
    return hashlib.sha256(value).hexdigest()


def git_blob(revision, path):
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{revision}:{path}"],
        capture_output=True, text=True, check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


# Exact follow-up UI patch and its test delegation. Any scientific or
# unrelated edit retains the original workflows and their checks.
FOLLOWUP_FILES = {
    ".github/workflows/dataset-discovery-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/sequence-result-checks.yml",
    "docs/user-guide.md",
    "frontend/src/admet/AdmetResults.tsx",
    "frontend/src/chemistry/LibraryScreenResults.tsx",
    "frontend/src/chemistry/StateResults.tsx",
    "frontend/src/datasets/CandidateHandoff.tsx",
    "frontend/src/diffsbdd/DiffResults.tsx",
    "frontend/src/discovery/ReferenceImportResults.tsx",
    "frontend/src/discovery/TargetResearchResults.tsx",
    "frontend/src/docking/DockingResults.test.tsx",
    "frontend/src/docking/DockingResults.tsx",
    "frontend/src/editors/Editors.tsx",
    "frontend/src/guided/ResearchHandoff.tsx",
    "frontend/src/humanization/HumanizationResults.tsx",
    "frontend/src/pockets/PocketResultsHandoff.tsx",
    "frontend/src/poses/PoseResults.tsx",
    "frontend/src/receptors/ReceptorResults.tsx",
    "frontend/src/receptors/StructurePrepareResults.tsx",
    "frontend/src/research/ResearchWorkspace.test.tsx",
    "frontend/src/research/ResearchWorkspace.tsx",
    "frontend/src/simulations/FreeEnergyResults.tsx",
    "frontend/src/structure-comparison/ComparisonResults.tsx",
    "frontend/src/studio/TaskWorkspace.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "scripts/target-evidence-scope.py",
    "server_tests/test_result_handoff_browser.py",
}
FOLLOWUP_DIFF = "c6cc1179bfb7e1a5e47f276a1f474876793b84a88b15f419dafc67a7882083bc"


IMAGE_FOCUS_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/utilities/ImageMoleculeInput.tsx",
    "frontend/src/utilities/UtilityImageInput.tsx",
    "frontend/src/utilities/utility-task.css",
    "server_tests/test_utility_image_browser.py",
    "tests/fixtures/utility_image/browser.tsx",
}
IMAGE_FOCUS_DIFF = "97ca35357ec32667dea099a9d96f0f983faff8160400ac844eaeafb89c6f99d9"


UTILITY_NAVIGATION_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/guided/molecular-review.css",
    "frontend/src/utilities/utility-task.css",
    "server_tests/test_molecular_review_controls_browser.py",
}
UTILITY_NAVIGATION_DIFF = "df3ade6d18c23db03652cf3d15b75dc1ebc76d0ac5ddb8d79a44a877e9c6ec4d"

UTILITY_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/utilities.css",
    "frontend/src/utilities/utility-task.css",
    "server_tests/test_utility_navigation_browser.py",
    "tests/test_molecular_utility_scope.py",
}
UTILITY_DESKTOP_DIFF = "ecad5e50e2869aaef046ae915b975e7a994e84d85325f61395d14fc6bef2b957"


POTENTIAL_DISPLAY_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/potential-grid-checks.yml",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/display-readiness.ts",
    "frontend/src/viewer/frame.ts",
    "frontend/src/viewer/potential-range.ts",
    "frontend/src/viewer/scene.ts",
    "frontend/src/viewer/source-layout.ts",
    "server_tests/test_apbs_range_browser.py",
    "server_tests/test_potential_sdk_browser.py",
    "tests/test_molecular_utility_scope.py",
}
POTENTIAL_DISPLAY_DIFF = "f22988ae3083137afe51720f45f506973eb08d762e7a0579905bd53ea9a96cbf"


RECOGNITION_POWER_FILES = {
    ".github/workflows/ketcher-depiction-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/editors/recognition-host-editor.css",
    "frontend/src/utilities/ImageMoleculeDialog.tsx",
    "frontend/src/utilities/image-molecule.css",
    "frontend/src/utilities/recognition-foreground.test.ts",
    "frontend/src/utilities/recognition-foreground.ts",
    "frontend/src/utilities/recognition-host-bridge.ts",
    "frontend/src/utilities/recognition-host-foreground.test.ts",
    "frontend/src/utilities/useRecognitionBridge.ts",
    "frontend/src/utilities/useRecognitionRequest.test.tsx",
    "frontend/src/utilities/useRecognitionRequest.ts",
    "server_tests/test_module_backend_switch_browser.py",
    "server_tests/test_utility_image_browser.py",
    "src/opendde_workbench/data/recognition_locale/patch.json",
    "tests/fixtures/utility_image/browser.tsx",
    "tests/test_molecular_utility_scope.py",
    "tests/test_recognition_companion.py",
}
RECOGNITION_POWER_DIFF = "931c66f515c294674f933f2833a6c77a3c22d178c72839bf782ca9b284548af4"


# Only this exact presentation patch takes the narrower browser gate.
BACKEND_PLACEMENT_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/result-handoff-checks.yml",
    "frontend/src/studio/TaskWorkspace.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/backend-control-scope.ts",
    "frontend/src/utilities/backend-runtime.ts",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "server_tests/test_result_handoff_browser.py",
    "tests/test_molecular_utility_scope.py",
}
BACKEND_PLACEMENT_DIFF = "6b67939a29d0b15f771b924e114cacf623411a4d58c6752e5541d51959fe6352"

TASK_POWER_FILES = {
    ".github/workflows/harness-checks.yml",
    ".github/workflows/managed-compute-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/service-control-checks.yml",
    ".github/workflows/task-action-checks.yml",
    ".github/workflows/template-controls-checks.yml",
    "docs/user-guide.md",
    "frontend/src/App.tsx",
    "frontend/src/examples/ExampleActions.test.tsx",
    "frontend/src/examples/ExampleActions.tsx",
    "frontend/src/examples/ExampleResultSet.tsx",
    "frontend/src/examples/ExampleToolbar.tsx",
    "frontend/src/studio/ApplicationScope.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendPowerSwitch.tsx",
    "frontend/src/utilities/ComputeSwitch.tsx",
    "frontend/src/utilities/RuntimeSwitch.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "frontend/src/utilities/utilities.css",
    "frontend/src/workflows/WorkflowBackendControl.tsx",
    "frontend/src/workflows/WorkflowCenter.test.tsx",
    "frontend/src/workflows/WorkflowCenter.tsx",
    "server_tests/test_module_backend_switch_browser.py",
    "src/opendde_workbench/api.py",
    "src/opendde_workbench/harness_service.py",
    "tests/test_compute_power_admission.py",
    "tests/test_molecular_utility_scope.py",
}
TASK_POWER_DIFF = "feac177b02d6ff045d14ecea28ea9ec26407ff210deee16ac16b967954511f43"

MODULE_BACKEND_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/studio/Header.tsx",
    "frontend/src/studio/ModuleWorkspaceNavigation.tsx",
    "frontend/src/studio/TaskHistoryToolbar.tsx",
    "frontend/src/studio/navigation-model.ts",
    "frontend/src/studio/task-history.css",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/UtilityTask.tsx",
    "server_tests/test_module_backend_switch_browser.py",
}
MODULE_BACKEND_DIFF = "da2612ac37d6f489c3ac796f34a3e0b80d86bd85a1daec33c5961e624b1f7dae"

NATIVE_STATE_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-preview-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/selected-pose-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/chemistry/StateCollectionPreview.test.tsx",
    "frontend/src/chemistry/StateCollectionPreview.tsx",
    "frontend/src/chemistry/StateInspectionTables.tsx",
    "frontend/src/chemistry/StateResultNotes.tsx",
    "frontend/src/chemistry/StateResults.test.tsx",
    "frontend/src/chemistry/StateResults.tsx",
    "frontend/src/chemistry/state-inspection.ts",
    "frontend/src/chemistry/states.css",
    "frontend/src/diffsbdd/GeneratedCandidateDownload.tsx",
    "frontend/src/presentation/MolecularPreview.tsx",
    "frontend/src/presentation/SdfArtifactDownload.tsx",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/pose-plan.test.ts",
    "frontend/src/viewer/pose-plan.ts",
    "frontend/src/viewer/pose-source.ts",
    "frontend/src/viewer/pose-types.ts",
    "frontend/src/viewer/usePoseOptimization.test.tsx",
    "frontend/src/viewer/usePoseOptimization.ts",
    "server_tests/test_state_results_workspace_browser.py",
    "tests/test_molecular_utility_scope.py",
}
NATIVE_STATE_DIFF = "65c9909aa0c41732fcb716457f159b1f266b341cf7135ac007a273dbb0f72f1e"

COMPACT_EXAMPLE_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/template-controls-checks.yml",
    "docs/design/research-examples.md",
    "frontend/src/examples/ExampleActions.test.tsx",
    "frontend/src/examples/ExampleActions.tsx",
    "frontend/src/examples/ExampleGuide.tsx",
    "frontend/src/examples/ExampleJobResult.tsx",
    "frontend/src/examples/ExampleRecordResult.test.tsx",
    "frontend/src/examples/ExampleRecordResult.tsx",
    "frontend/src/examples/ExampleResultSet.test.tsx",
    "frontend/src/examples/ExampleResultSet.tsx",
    "frontend/src/examples/ExampleStageNavigation.tsx",
    "frontend/src/examples/ExampleToolbar.tsx",
    "frontend/src/examples/examples.css",
    "frontend/src/presentation/plots/plots.css",
    "frontend/src/utilities/UtilityTask.test.tsx",
    "server_tests/test_compact_example_guide_browser.py",
    "server_tests/test_result_visuals_browser.py",
    "tests/test_molecular_utility_scope.py",
}
COMPACT_EXAMPLE_DIFF = "2818fd353d7450fa9e1c651aef9c7394eaa66eceacffb41708d602a1507dc515"

MOBILE_HEADER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/navigation-shell-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/viewer-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/chemistry/states.css",
    "frontend/src/integrations/interaction-workspace.css",
    "frontend/src/pockets/pocket-results.css",
    "frontend/src/presentation/prediction-shell.css",
    "frontend/src/receptors/receptors.css",
    "frontend/src/studio/Header.tsx",
    "frontend/src/studio/header.css",
    "frontend/src/utilities/BackendControls.tsx",
    "server_tests/test_navigation_shell_browser.py",
    "tests/test_molecular_utility_scope.py",
}
MOBILE_HEADER_DIFF = "06dee94bdfc85b11323769a6edf467758ddb245af81ec01f0161673e016ff8f6"

DESKTOP_HEADER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/navigation-shell-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/template-controls-checks.yml",
    ".github/workflows/viewer-checks.yml",
    "frontend/src/chemistry/states.css",
    "frontend/src/examples/examples.css",
    "frontend/src/pockets/pocket-results.css",
    "frontend/src/presentation/prediction-shell.css",
    "frontend/src/receptors/receptors.css",
    "frontend/src/studio/header.css",
    "server_tests/test_navigation_shell_browser.py",
    "server_tests/prepare_shell_history.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_HEADER_DIFF = "b0e718054f95337e46ea792c98bf0561de6c475ce96caf984e1897ae15496cf7"

INITIAL_POSE_POWER_FILES = {
    ".github/workflows/molecule-design-review-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/selected-pose-checks.yml",
    ".github/workflows/task-service-availability.yml",
    "docs/user-guide.md",
    "frontend/src/viewer/InitialPoseStatus.tsx",
    "frontend/src/viewer/PreviewAvailability.test.tsx",
    "frontend/src/viewer/usePoseOptimization.ts",
    "frontend/src/viewer/viewer.css",
    "server_tests/test_initial_pose_browser.py",
    "server_tests/test_initial_pose_power_browser.py",
    "server_tests/test_native_initial_pose.py",
    "src/opendde_workbench/research/initial_pose.py",
    "src/opendde_workbench/research/pose_routes.py",
    "tests/test_molecular_utility_scope.py",
    "tests/test_pose_preview_availability.py",
}
INITIAL_POSE_POWER_DIFF = "566ba740c85bef4302d9e11087585eb3141571049e0123b06356d5e6ee616afc"

MOBILE_VIEWER_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/publication-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/chemistry/states.css",
    "frontend/src/pockets/pocket-results.css",
    "frontend/src/presentation/prediction-inspection.css",
    "frontend/src/publication/FigureExport.tsx",
    "frontend/src/receptors/prepared-structure.css",
    "frontend/src/receptors/receptors.css",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/ViewerExportActions.tsx",
    "frontend/src/viewer/ViewerToolGroup.tsx",
    "frontend/src/viewer/viewer-tool-group.css",
    "frontend/src/viewer/viewer.css",
    "server_tests/test_mobile_viewer_toolbar_browser.py",
    "server_tests/test_prediction_workspace_browser.py",
    "server_tests/test_target_selection_browser.py",
    "tests/test_molecular_utility_scope.py",
}
MOBILE_VIEWER_DIFF = "ebc248ef679e664c4955441262c9e742a510df3a7edfb497363a6e00940b4d9e"

SPLIT_VIEWER_FILES = {
    ".github/workflows/publication-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/presentation/workspace-expansion.ts",
    "frontend/src/viewer/ViewerToolGroup.tsx",
    "frontend/src/viewer/viewer-tool-group.css",
    "server_tests/test_split_viewer_toolbar_browser.py",
    "tests/test_molecular_utility_scope.py",
}
SPLIT_VIEWER_DIFF = "fcd668deeca469111005f7d56aaecb0d54dc100598bcd1f4ade24e69e216b592"

PRINT_LABEL_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/publication-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/viewer/capture.ts",
    "frontend/src/viewer/contact-label-layout.test.ts",
    "frontend/src/viewer/contact-label-layout.ts",
    "frontend/src/viewer/figure-label-leaders.ts",
    "frontend/src/viewer/figure-occupancy.ts",
    "frontend/src/viewer/native-label-layout.ts",
    "frontend/src/viewer/native-labels.test.ts",
    "frontend/src/viewer/native-labels.ts",
    "server_tests/publication_raster_metrics.py",
    "server_tests/test_contact_print_layout_browser.py",
    "tests/test_molecular_utility_scope.py",
}
PRINT_LABEL_DIFF = "a3f60c60a904cb869ee6c9bd5ea71066ab186950a1ff87bbac9c393fbd0b421e"

MODULE_POWER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/datasets/ScreeningForm.tsx",
    "frontend/src/datasets/ScreeningForm.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "server_tests/test_screening_power_browser.py",
    "tests/test_molecular_utility_scope.py",
}
MODULE_POWER_DIFF = "74a5a31f3fd8474142e1acfb00a2ba16ca63551890a519aa3778721eb784377d"
INLINE_MODULE_POWER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/studio/TaskHistoryToolbar.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/browser_platform.py",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_molecular_utility_scope.py",
}
INLINE_MODULE_POWER_DIFF = "43c5e70f0b7e8ef2be169ffacb47265fb2a47a39473242daf0fdf64b5d260301"
RESULT_MODULE_POWER_FILES = {
    "docs/user-guide.md",
    "frontend/src/studio/TaskHistoryToolbar.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_molecular_utility_scope.py",
}
RESULT_MODULE_POWER_DIFF = "56c58e6f54a21958473e43c220f49de94141a3556bee8030c5c8837147fb93ba"
BACKEND_SETUP_FILES = {
    "docs/user-guide.md",
    "frontend/src/App.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendPowerSwitch.tsx",
    "frontend/src/utilities/RuntimeSwitch.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
}
BACKEND_SETUP_DIFF = "c8347a8e009067581feb1cb0247d6e742e78bc327b7c7eeb82cd126ce1758738"
COMPOSED_POWER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/examples/ExampleActions.test.tsx",
    "frontend/src/operations/ToolCenter.tsx",
    "frontend/src/poses/PoseWorkspace.test.tsx",
    "frontend/src/poses/PoseWorkspace.tsx",
    "frontend/src/regions/RegionWorkspace.tsx",
    "frontend/src/workflows/WorkflowBackendControl.tsx",
    "frontend/src/workflows/WorkflowCenter.test.tsx",
    "server_tests/test_module_backend_switch_browser.py",
    "src/opendde_workbench/runtime_controls.py",
    "tests/test_molecular_utility_scope.py",
    "tests/test_utility_tools.py",
}
COMPOSED_POWER_DIFF = "ebbafb3a14d65227e823ebbebeca383cdd7bfef868721c347dec73efe3875a8b"
DESKTOP_HELP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/App.tsx",
    "frontend/src/design/controls.css",
    "frontend/src/design/workspaces.css",
    "frontend/src/studio.css",
    "frontend/src/studio/HelpWorkspace.css",
    "frontend/src/studio/HelpWorkspace.tsx",
    "frontend/src/utilities/UtilityWorkspace.test.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "server_tests/test_desktop_help_browser.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_HELP_DIFF = "859f9bfde6462dbf773ccb6019c1fd753a1b32e74217cd621f57e246ca18e1a5"
REFINEMENT_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/property-model-review-checks.yml",
    ".github/workflows/refinement-input-checks.yml",
    "frontend/src/integrations/RefinementSummary.tsx",
    "frontend/src/integrations/ScientificResults.test.tsx",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/integrations/refinement-energy-labels.ts",
    "frontend/src/integrations/refinement-summary.css",
    "server_tests/test_refinement_review_browser.py",
    "tests/test_molecular_utility_scope.py",
}
REFINEMENT_DESKTOP_DIFF = "de642697bdf1ed450f220f9aeb76aab29f723b06c3e5240a0715770afacf2990"
SPATIAL_DESKTOP_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/space-analysis-checks.yml",
    ".github/workflows/surface-exposure-checks.yml",
    "frontend/src/integrations/PotentialResults.tsx",
    "frontend/src/integrations/potential-results.css",
    "frontend/src/presentation/SpatialResultSummary.tsx",
    "frontend/src/presentation/spatial-results.css",
    "frontend/src/receptors/SurfaceResults.tsx",
    "frontend/src/receptors/SurfaceTable.tsx",
    "frontend/src/receptors/surface.css",
    "frontend/src/space/ChannelResults.tsx",
    "frontend/src/space/channels.css",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/viewer.css",
    "server_tests/test_spatial_results_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
SPATIAL_DESKTOP_DIFF = "9295ffd4f972f8b6b806cff9a3d2d24e63f1b132c8bafe76e3cde2cdf6ecaa56"
MODULE_POWER_CONSUMERS = (
    MODULE_POWER_FILES | INLINE_MODULE_POWER_FILES | RESULT_MODULE_POWER_FILES
) - {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "tests/test_molecular_utility_scope.py",
}


def reviewed_selected(changed, event, base, files, digest, *, scope_pin=None):
    if event not in {"push", "pull_request"} or not files <= changed:
        return False
    scope = run_path(str(Path(__file__).with_name("docking-result-scope.py")))
    selector = "scripts/molecular-utility-scope.py"
    remaining = changed - files - {selector}
    if not remaining <= scope["VERSION_FILES"]:
        return False
    if remaining and not scope["only_version_mirrors"](base, remaining):
        return False
    reviewed = [
        [path, blob_digest(base, path), blob_digest("HEAD", path)]
        for path in sorted(files)
    ]
    if scope_pin:
        # Mask the digest assignment so the selector itself can be pinned.
        mask = f'{scope_pin} = "{digest}"'.encode()
        reviewed.append([
            selector, blob_digest(base, selector), blob_digest("HEAD", selector, mask=mask),
        ])
    return hashlib.sha256(
        json.dumps(reviewed, separators=(",", ":")).encode()
    ).hexdigest() == digest


def followup_selected(changed, event, base):
    return reviewed_selected(changed, event, base, FOLLOWUP_FILES, FOLLOWUP_DIFF)


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
    touch_controls = touch_controls or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base, IMAGE_FOCUS_FILES, IMAGE_FOCUS_DIFF
    )
    navigation = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        UTILITY_NAVIGATION_FILES, UTILITY_NAVIGATION_DIFF,
    )
    potential_display = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        POTENTIAL_DISPLAY_FILES, POTENTIAL_DISPLAY_DIFF,
    )
    recognition_power = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RECOGNITION_POWER_FILES, RECOGNITION_POWER_DIFF,
    )
    task_power = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        TASK_POWER_FILES, TASK_POWER_DIFF,
    )
    module_backend = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        MODULE_BACKEND_FILES, MODULE_BACKEND_DIFF,
    )
    backend_setup = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        BACKEND_SETUP_FILES, BACKEND_SETUP_DIFF, scope_pin="BACKEND_SETUP_DIFF",
    )
    composed_power = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        COMPOSED_POWER_FILES, COMPOSED_POWER_DIFF, scope_pin="COMPOSED_POWER_DIFF",
    )
    module_power = backend_setup or composed_power or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        MODULE_POWER_FILES, MODULE_POWER_DIFF,
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        INLINE_MODULE_POWER_FILES, INLINE_MODULE_POWER_DIFF,
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RESULT_MODULE_POWER_FILES, RESULT_MODULE_POWER_DIFF,
        scope_pin="RESULT_MODULE_POWER_DIFF",
    )
    backend_placement = task_power or module_backend or module_power or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        BACKEND_PLACEMENT_FILES, BACKEND_PLACEMENT_DIFF,
    )
    native_state = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        NATIVE_STATE_FILES, NATIVE_STATE_DIFF,
    )
    compact_example = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        COMPACT_EXAMPLE_FILES, COMPACT_EXAMPLE_DIFF,
    )
    mobile_header = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        MOBILE_HEADER_FILES, MOBILE_HEADER_DIFF,
    )
    desktop_header = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_HEADER_FILES, DESKTOP_HEADER_DIFF,
    )
    initial_pose_power = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        INITIAL_POSE_POWER_FILES, INITIAL_POSE_POWER_DIFF,
    )
    mobile_viewer = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        MOBILE_VIEWER_FILES, MOBILE_VIEWER_DIFF,
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SPLIT_VIEWER_FILES, SPLIT_VIEWER_DIFF,
    )
    print_labels = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PRINT_LABEL_FILES, PRINT_LABEL_DIFF,
    )
    utility_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        UTILITY_DESKTOP_FILES, UTILITY_DESKTOP_DIFF,
    )
    desktop_help = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_HELP_FILES, DESKTOP_HELP_DIFF, scope_pin="DESKTOP_HELP_DIFF",
    )
    refinement_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        REFINEMENT_DESKTOP_FILES, REFINEMENT_DESKTOP_DIFF, scope_pin="REFINEMENT_DESKTOP_DIFF",
    )
    spatial_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SPATIAL_DESKTOP_FILES, SPATIAL_DESKTOP_DIFF, scope_pin="SPATIAL_DESKTOP_DIFF",
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("initial_pose_power_only=" + str(initial_pose_power).lower() + "\n")
        output.write("backend_placement_only=" + str(backend_placement).lower() + "\n")
        output.write("task_power_only=" + str(task_power).lower() + "\n")
        output.write("module_backend_only=" + str(module_backend).lower() + "\n")
        output.write("module_power_only=" + str(module_power).lower() + "\n")
        output.write("composed_power_only=" + str(composed_power).lower() + "\n")
        power_changed = (
            not changed or backend_setup or bool(MODULE_POWER_CONSUMERS.intersection(changed))
        )
        output.write("module_power_changed=" + str(power_changed).lower() + "\n")
        output.write("native_state_only=" + str(native_state).lower() + "\n")
        output.write("compact_example_only=" + str(compact_example).lower() + "\n")
        output.write("mobile_header_only=" + str(mobile_header).lower() + "\n")
        output.write("desktop_header_only=" + str(desktop_header).lower() + "\n")
        output.write("mobile_viewer_only=" + str(mobile_viewer).lower() + "\n")
        output.write("print_labels_only=" + str(print_labels).lower() + "\n")
        output.write("recognition_power_only=" + str(recognition_power).lower() + "\n")
        output.write("potential_display_only=" + str(potential_display).lower() + "\n")
        output.write("utility_navigation_only=" + str(navigation).lower() + "\n")
        output.write("utility_desktop_only=" + str(utility_desktop).lower() + "\n")
        output.write("desktop_help_only=" + str(desktop_help).lower() + "\n")
        output.write("refinement_desktop_only=" + str(refinement_desktop).lower() + "\n")
        output.write("spatial_desktop_only=" + str(spatial_desktop).lower() + "\n")
        output.write("touch_controls_only=" + str(touch_controls).lower() + "\n")
        event = os.environ.get("GITHUB_EVENT_NAME", "push")
        shared_paths = SHARED.keys()
        if set(changed) & RUNTIME_SOURCES:
            shared_paths = shared_paths | RUNTIME_CONSUMERS.keys()
        shared = {
            path: (blob_digest(base, path), blob_digest("HEAD", path))
            for path in set(changed) & shared_paths
        }
        runtime = (
            backend_placement or runtime_selected(changed, event, shared=shared)
            or followup_selected(set(changed), event, base)
        )
        layout = result_header_selected(changed, event, blobs={
            path: (git_blob(base, path), git_blob("HEAD", path))
            for path in set(changed) & RESULT_HEADER_BLOBS.keys()
        })
        utility = (
            recognition_power or potential_display or navigation or runtime or layout
            or native_state or compact_example or mobile_header or desktop_header
            or initial_pose_power
            or mobile_viewer or print_labels or utility_desktop or desktop_help
            or refinement_desktop or spatial_desktop
            or selected(changed, event, shared=shared)
        )
        output.write("runtime_switch_only=" + str(runtime).lower() + "\n")
        output.write("result_header_only=" + str(layout).lower() + "\n")
        output.write("utility_only=" + str(utility).lower() + "\n")


if __name__ == "__main__":
    main()
