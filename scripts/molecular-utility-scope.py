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
    "frontend/src/editors/recognition-host-editor.css",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/image-molecule.css",
    "server_tests/test_utility_image_browser.py",
    "server_tests/test_utility_navigation_browser.py",
    "src/opendde_workbench/data/recognition_locale/patch.json",
}
UTILITY_DESKTOP_DIFF = "72394075610117017102f62e7e99a9913e65c663fee1403a9412f9af33f096d1"


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
RECOGNITION_ACCESS_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/utilities/ImageMoleculeDialog.tsx",
    "frontend/src/utilities/ImageMoleculeInput.tsx",
    "frontend/src/utilities/ImageMoleculeInput.test.tsx",
    "frontend/src/utilities/ImageMoleculeInput.action.test.tsx",
    "frontend/src/utilities/UtilityImageTask.test.tsx",
    "frontend/src/utilities/image-molecule.css",
    "frontend/src/utilities/useImageInputSession.ts",
    "frontend/src/utilities/useRecognitionBridge.ts",
    "frontend/src/utilities/useRecognitionRequest.test.tsx",
    "frontend/src/utilities/useRecognitionRequest.ts",
    "server_tests/test_utility_image_browser.py",
    "tests/test_molecular_utility_scope.py",
}
RECOGNITION_ACCESS_DIFF = "6a6f5b12881cd06d704cac3d715e2779eb09c9533287ef616b215b67dadff949"
RECOGNITION_ENTRY_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/App.tsx",
    "frontend/src/studio/Header.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/ImageRecognition.tsx",
    "frontend/src/utilities/RecognitionBackendEntry.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "src/opendde_workbench/utility_routes.py",
    "tests/test_molecular_utility_scope.py",
    "tests/test_utility_tools.py",
}
RECOGNITION_ENTRY_DIFF = "cac849f9ca1589c2878ce789af25b092ed6ae25b710a14c62fd9774d7072cf46"
NATIVE_RECOGNITION_POWER_FILES = {
    "scripts/check-recognition-idle-power.mjs",
    "scripts/recognition-idle-power.patch",
    "tests/fixtures/recognition_idle_power/SHA256SUMS",
    "tests/fixtures/recognition_idle_power/desktop/lifecycle.mjs",
    "tests/fixtures/recognition_idle_power/desktop/security.mjs",
    "tests/fixtures/recognition_idle_power/desktop/server.mjs",
}
RECOGNITION_PANEL_POWER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/RecognitionBackendEntry.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "src/opendde_workbench/runtime_controls.py",
    "src/opendde_workbench/utility_routes.py",
    "tests/test_utility_tools.py",
} | NATIVE_RECOGNITION_POWER_FILES
RECOGNITION_PANEL_POWER_DIFF = "4d42bb33efc7ee5e23f96a572897d59ea7c7d1e746f331e1efc947c4047c450a"
INLINE_RECOGNITION_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/operations/PropertyForm.test.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendPowerSwitch.tsx",
    "frontend/src/utilities/ImageMoleculeDialog.tsx",
    "frontend/src/utilities/ImageMoleculeInput.tsx",
    "frontend/src/utilities/RecognitionBackendEntry.tsx",
    "frontend/src/utilities/image-molecule.css",
    "frontend/src/utilities/recognition-power.ts",
    "frontend/src/utilities/runtime-switch.css",
    "frontend/src/utilities/useImageInputSession.ts",
    "frontend/src/utilities/useRecognitionBridge.ts",
    "frontend/src/utilities/useRecognitionRequest.test.tsx",
    "frontend/src/utilities/useRecognitionRequest.ts",
    "server_tests/test_module_backend_switch_browser.py",
    "server_tests/test_utility_image_browser.py",
    "tests/fixtures/utility_image/browser.tsx",
    "tests/test_molecular_utility_scope.py",
}
INLINE_RECOGNITION_DIFF = "6ad8190d16ad818009d06e3a4510229edd3ef9a7193d3871b223b5a1d169eac0"


EDITOR_DRAWING_FILES = {
    ".github/workflows/ketcher-depiction-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/editors/recognition-host-editor.css",
    "frontend/src/guided/InputActionScope.tsx",
    "frontend/src/utilities/ImageRecognition.test.tsx",
    "frontend/src/utilities/ImageRecognition.tsx",
    "frontend/src/utilities/UtilityDrawingContext.ts",
    "frontend/src/utilities/UtilityImageInput.tsx",
    "frontend/src/utilities/UtilityImageTask.test.tsx",
    "frontend/src/utilities/UtilityTask.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/image-molecule.ts",
    "frontend/src/utilities/recognition-host-bridge.test.ts",
    "frontend/src/utilities/recognition-host-bridge.ts",
    "frontend/src/utilities/recognition-locale.ts",
    "frontend/src/utilities/useRecognitionDrawing.ts",
    "frontend/src/utilities/utilities.css",
    "server_tests/test_utility_image_browser.py",
    "src/opendde_workbench/data/recognition_locale/patch.json",
    "tests/fixtures/utility_image/browser.tsx",
    "tests/test_molecular_utility_scope.py",
}
EDITOR_DRAWING_DIFF = "1dd7db67ba84ae1c82d410769695ad89dd13e3b61c4292bbf471fe3dfdb780f4"
PORTABLE_SMILES_FILES = {
    "docs/recognition-locale.md",
    "frontend/src/editors/portable-smiles.test.ts",
    "frontend/src/editors/portable-smiles.ts",
    "src/opendde_workbench/data/recognition_locale/patch.json",
    "tests/test_molecular_utility_scope.py",
}
PORTABLE_SMILES_DIFF = "7fe2aaaa8285b84feb2056855160f5026965415f3a7358d70d2d5ba13cf35db7"
ARCHIVED_POSE_REVIEW_FILES = {
    ".github/workflows/ligand-energy-scope.yml",
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/poses/ClusterResults.tsx",
    "frontend/src/poses/ClusterTables.tsx",
    "frontend/src/presentation/pose-review-workspace.css",
    "frontend/src/viewer/MinimizedPoseResults.tsx",
    "frontend/src/viewer/MinimizedPoseResults.test.tsx",
}
ARCHIVED_POSE_REVIEW_DIFF = "f5010cb71c2ecde7dc012264275db3c586a90699296198436c3370220c26f770"
GUIDED_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/guided/desktop-questionnaire.css",
    "frontend/src/guided/questionnaire.css",
    "server_tests/test_guided_desktop_browser.py",
    "tests/test_molecular_utility_scope.py",
}
GUIDED_DESKTOP_DIFF = "a2d225818427a1253f9b8a2da3d20ba87c8fa89587ca7efc71be0d425a4ed57f"
UTILITY_QUERY_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/chemistry/LibraryScreenQuestions.tsx",
    "frontend/src/research/MaterialInput.tsx",
    "frontend/src/utilities/ImageMoleculeInput.tsx",
    "frontend/src/utilities/UtilityImageInput.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/utility-task.css",
    "frontend/src/utilities/utilities.css",
    "server_tests/test_utility_image_browser.py",
}
UTILITY_QUERY_DIFF = "7d47e8f1c3b95b1261bce31f088e1f916dc27512941a1130bc7a83fff0d85273"
COMPACT_MATERIAL_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/chemistry/StateForm.tsx",
    "frontend/src/guided/Questionnaire.tsx",
    "frontend/src/guided/SinglePageReadiness.tsx",
    "frontend/src/guided/SinglePageTask.test.tsx",
    "frontend/src/utilities/UtilitySinglePage.test.tsx",
    "frontend/src/utilities/utility-task.css",
    "server_tests/test_molecular_review_controls_browser.py",
}
COMPACT_MATERIAL_DIFF = "29a8e09eb6b4c9757c798219adb95f81db3526dd45f0c439c5f4a8b73ab848a0"


PAIRED_FIGURE_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/property-model-review-checks.yml",
    ".github/workflows/proximity-checks.yml",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    "docs/user-guide.md",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/proximity/AssemblyComparison.tsx",
    "frontend/src/proximity/Results.tsx",
    "frontend/src/publication/FigureDialog.tsx",
    "frontend/src/publication/FigureExport.tsx",
    "frontend/src/publication/figure-panels.ts",
    "frontend/src/publication/paired-framing.ts",
    "frontend/src/publication/paired-molecular-figure.ts",
    "frontend/src/simulations/BoundPoseComparison.tsx",
    "frontend/src/simulations/comparison-figure.test.ts",
    "frontend/src/simulations/comparison-figure.ts",
    "frontend/src/simulations/molstar-figure.ts",
    "frontend/src/structure-comparison/AlignedStructurePair.tsx",
    "frontend/src/structure-comparison/ComparisonPreview.tsx",
    "frontend/src/viewer/StructurePairFigure.tsx",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/capture.test.ts",
    "frontend/src/viewer/capture.ts",
    "frontend/src/viewer/frame.ts",
    "frontend/src/viewer/useStructureFigure.test.ts",
    "frontend/src/viewer/useStructureFigure.ts",
    "frontend/src/viewer/useViewerSnapshot.ts",
    "server_tests/test_archived_comparison_browser.py",
    "server_tests/test_proximity_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
PAIRED_FIGURE_DIFF = "b40d94a71f29d82fe33fd3f8860530dc71fb63dfbf1d536dc0e204f67264fa59"
NATIVE_COLOR_FIGURE_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/publication-checks.yml",
    "frontend/src/publication/molecular-color-key.ts",
    "frontend/src/publication/FigureExport.test.tsx",
    "frontend/src/publication/FigurePreview.tsx",
    "frontend/src/publication/useFigurePreview.ts",
    "frontend/src/viewer/ConfidenceControls.tsx",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/SurfaceLegend.tsx",
    "frontend/src/viewer/electric-color-scale.ts",
    "frontend/src/viewer/scientific-color-keys.test.ts",
    "frontend/src/viewer/scientific-color-keys.ts",
    "frontend/src/viewer/scene.ts",
    "frontend/src/viewer/style.test.ts",
    "frontend/src/viewer/viewer.css",
    "server_tests/test_native_color_key_publication_browser.py",
    "tests/test_molecular_utility_scope.py",
}
NATIVE_COLOR_FIGURE_DIFF = "5d182f2b996e6ccb36b7436646d677a27f2acc296d18fbc366ffc27f830a5a5e"


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
INITIAL_POSE_RECOVERY_FILES = {
    "docs/user-guide.md",
    "frontend/src/viewer/InitialPoseStatus.tsx",
    "frontend/src/viewer/PoseOptimizationControls.tsx",
    "frontend/src/viewer/PreviewAvailability.test.tsx",
    "server_tests/test_initial_pose_power_browser.py",
    "tests/test_molecular_utility_scope.py",
}
INITIAL_POSE_RECOVERY_DIFF = "941212085abc08aa841a1e322e196bdd6da196900f4140807a83167e914b0d96"

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
MODULE_POWER_ENTRY_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/studio/Header.tsx",
    "frontend/src/studio/TaskHistoryToolbar.tsx",
    "frontend/src/studio/research-modules.ts",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/RuntimeSwitch.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_molecular_utility_scope.py",
}
MODULE_POWER_ENTRY_DIFF = "4cfa9adb9f10805473c24b9436d9e3df8d849e3d1d20128138cc3980f4bd80a1"
FUNCTION_POWER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendPanelList.tsx",
    "frontend/src/utilities/BackendPowerSwitch.tsx",
    "frontend/src/utilities/ComputeSwitch.tsx",
    "frontend/src/utilities/ImageRecognition.test.tsx",
    "frontend/src/utilities/ImageRecognition.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_molecular_utility_scope.py",
}
FUNCTION_POWER_DIFF = "4f2213a3a30563022318a2ae6d22bb6875b0fbb46b2031743b57393146ac8275"
DESKTOP_BACKEND_HEADER_FILES = {
    "frontend/src/studio/TaskSearch.tsx",
    "frontend/src/studio/header.css",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "server_tests/test_navigation_shell_browser.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_BACKEND_HEADER_DIFF = "f7647f3b0c364cffaa104072c19fb54bce826abe8d2e113b3bdfb383df5e1161"
STABLE_MODULE_SWITCH_FILES = {
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_molecular_utility_scope.py",
}
STABLE_MODULE_SWITCH_DIFF = "6a41946b526de05de91bb4d5571d4345b0cd5368b3aaf8a68dacf4c72c4ddb90"
CONTEXTUAL_BACKEND_PANEL_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/App.tsx",
    "frontend/src/studio/Header.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendPanelList.tsx",
    "frontend/src/utilities/BackendPowerSwitch.tsx",
    "frontend/src/utilities/ComputeSwitch.tsx",
    "frontend/src/utilities/RuntimeSwitch.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "tests/test_molecular_utility_scope.py",
}
CONTEXTUAL_BACKEND_PANEL_DIFF = "35d4213acbdee98a008ba75a54adf4d5a10bab92895edee6b2d39f069a9b2971"
PERSISTENT_TASK_POWER_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/App.tsx",
    "frontend/src/studio/ApplicationScope.tsx",
    "frontend/src/studio/Header.tsx",
    "frontend/src/studio/HomeWorkspace.test.tsx",
    "frontend/src/studio/HomeWorkspace.tsx",
    "frontend/src/studio/ModuleTaskPicker.css",
    "frontend/src/studio/ModuleTaskPicker.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/BackendPowerSwitch.tsx",
    "frontend/src/utilities/RuntimeSwitch.tsx",
    "frontend/src/utilities/TaskBackendControl.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "server_tests/test_module_backend_switch_browser.py",
    "server_tests/test_screening_power_browser.py",
}
PERSISTENT_TASK_POWER_DIFF = "85b0509b39f6b7ca4458900ea80161067d0e59e753a165d9e1c8777c22a6951f"
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
    ".github/workflows/template-controls-checks.yml",
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
COMPOSED_POWER_DIFF = "e48229fc371a5fe9b8c39affd81e4e4be455f23e252d32b797f10af9204b3248"
BACKEND_STATE_FILES = {
    # Pin the root version bump without replacing matching dependency versions.
    "frontend/package-lock.json",
    "frontend/src/examples/ExampleActions.test.tsx",
    "frontend/src/examples/ExampleActions.tsx",
    "frontend/src/examples/ExampleToolbar.tsx",
    "frontend/src/utilities/BackendControls.test.tsx",
    "frontend/src/utilities/BackendControls.tsx",
    "frontend/src/utilities/ComputeSwitch.tsx",
    "frontend/src/utilities/runtime-switch.css",
    "frontend/src/workflows/WorkflowBackendControl.tsx",
    "frontend/src/workflows/WorkflowCenter.tsx",
    "frontend/src/workflows/model.ts",
}
BACKEND_STATE_DIFF = "b97ca8835094bcb464cd1ed7505068b93fbc60b7ebc36df6617f20a82a1a77bf"
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
SPATIAL_REVIEW_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/sequence-result-checks.yml",
    "frontend/src/integrations/InteractionResults.tsx",
    "frontend/src/integrations/interaction-workspace.css",
    "frontend/src/integrations/refinement-summary.css",
    "frontend/src/presentation/spatial-result-review.css",
    "frontend/src/quality/QualityResults.tsx",
    "frontend/src/quality/quality-results.css",
    "frontend/src/space/ChannelResults.tsx",
    "frontend/src/space/channels.css",
    "server_tests/test_spatial_inspection_followups_browser.py",
}
SPATIAL_REVIEW_DIFF = "8d316e20f0ed58917da40f2c3f2d374e725f893200098f48061b20e60b5e1a4c"
SHORT_STRUCTURE_REVIEW_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/protein-interface-checks.yml",
    "frontend/src/integrations/ProteinInterfaceResults.tsx",
    "frontend/src/integrations/interaction-workspace.css",
    "frontend/src/presentation/spatial-result-review.css",
    "frontend/src/structure-comparison/ComparisonPreview.tsx",
    "frontend/src/structure-comparison/ComparisonResults.tsx",
    "frontend/src/structure-comparison/comparison-result-view.css",
    "frontend/src/viewer/StructurePairFigure.tsx",
    "server_tests/test_short_protein_viewports.py",
}
SHORT_STRUCTURE_REVIEW_DIFF = "5bc1ed47dcbf217a5662df1d20cce2d5912b6f61fff4b6de58f50924fc18d46f"
SHORT_PAIRED_COMPARISON_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/structure-comparison/ComparisonPreview.tsx",
    "frontend/src/structure-comparison/comparison-result-view.css",
    "server_tests/test_short_protein_viewports.py",
    "tests/test_molecular_utility_scope.py",
}
SHORT_PAIRED_COMPARISON_DIFF = "a2a88b7d66563b6b6501271da9a7ab4a3f2077c827b6ee581fb19098e13413a2"
SEQUENCE_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/property-model-review-checks.yml",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/integrations/ScientificResults.test.tsx",
    "frontend/src/integrations/SequenceDesignOverview.test.tsx",
    "frontend/src/integrations/SequenceDesignOverview.tsx",
    "frontend/src/operations/CandidateSequenceResults.tsx",
    "frontend/src/operations/SequenceProposalSummary.tsx",
    "frontend/src/operations/candidate-results.css",
    "frontend/src/presentation/sequence-review.css",
    "server_tests/test_sequence_review_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
SEQUENCE_DESKTOP_DIFF = "837cec103f0a77a977f32810bd325992192533c6fc16b18a271a083aac074615"
SEQUENCE_COMPARISON_FILES = {
    ".github/workflows/fold-assessment-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/sequence-result-checks.yml",
    ".github/workflows/windows-capacity-checks.yml",
    ".github/workflows/workspace-preview-checks.yml",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/operations/CandidateChainComparison.tsx",
    "frontend/src/operations/CandidateSequenceResults.test.tsx",
    "frontend/src/operations/CandidateSequenceResults.tsx",
    "frontend/src/presentation/SequenceTrack.tsx",
    "frontend/src/presentation/sequence-review.css",
    "server_tests/test_sequence_review_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
SEQUENCE_COMPARISON_DIFF = "ec203137621150ee406b0ea3b6569b7e7747dda958b17a7483e223874330ae19"
PROTEIN_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/protein-interface-checks.yml",
    "frontend/src/guided/Hint.tsx",
    "frontend/src/integrations/ProteinInterfaceContacts.tsx",
    "frontend/src/integrations/ProteinInterfaceResults.test.tsx",
    "frontend/src/integrations/ProteinInterfaceResults.tsx",
    "frontend/src/integrations/interaction-workspace.css",
    "frontend/src/structure-comparison/ComparisonFiles.tsx",
    "frontend/src/structure-comparison/ComparisonResults.tsx",
    "frontend/src/structure-comparison/comparison.css",
    "frontend/src/structure-comparison/comparison-result-view.css",
    "server_tests/test_protein_interface_workspace_browser.py",
    "server_tests/test_protein_review_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
PROTEIN_DESKTOP_DIFF = "384e184627cc2c834334f8333b981262eb09c46d4e6ca83d73b20255a0fd5120"
HISTORY_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/task-history-checks.yml",
    "frontend/package-lock.json",
    "frontend/src/App.test.tsx",
    "frontend/src/App.tsx",
    "frontend/src/design/research-navigation.css",
    "frontend/src/studio/TaskHistoryFilters.tsx",
    "frontend/src/studio/TaskHistoryList.test.tsx",
    "frontend/src/studio/TaskHistoryList.tsx",
    "frontend/src/studio/TaskHistoryToolbar.tsx",
    "frontend/src/studio/TaskWorkspace.test.tsx",
    "frontend/src/studio/TaskWorkspace.tsx",
    "frontend/src/studio/task-history.css",
    "server_tests/test_prediction_job_archive_browser.py",
    "server_tests/test_task_history_browser.py",
    "server_tests/test_task_status_browser.py",
    "tests/test_molecular_utility_scope.py",
}
HISTORY_DESKTOP_DIFF = "18924fe5b9696fbe289451636de90669583d80ee60418a347ec52f0f6c3927ff"
CANDIDATE_DESKTOP_FILES = {
    ".github/workflows/dataset-discovery-checks.yml",
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-preview-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/package-lock.json",
    "frontend/src/datasets/CandidateTable.test.tsx",
    "frontend/src/datasets/CandidateTable.tsx",
    "frontend/src/datasets/CandidateView.css",
    "frontend/src/datasets/CandidateView.test.tsx",
    "frontend/src/datasets/CandidateView.tsx",
    "frontend/src/datasets/DatasetResults.tsx",
    "frontend/src/datasets/candidate-table.css",
    "frontend/src/diffsbdd/GeneratedCandidates.css",
    "frontend/src/diffsbdd/GeneratedCandidates.tsx",
    "frontend/src/presentation/MolecularPreview.tsx",
    "frontend/src/viewer/StructureViewer.tsx",
    "frontend/src/viewer/pose-plan.test.ts",
    "frontend/src/viewer/pose-plan.ts",
    "frontend/src/viewer/pose-types.ts",
    "server_tests/test_candidate_inspection_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
CANDIDATE_DESKTOP_DIFF = "1a4b948f38b1177d491c1715192a1f1d81f811a0b7923703700871ec48d37c0b"
SCREENING_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/datasets/DatasetResults.test.tsx",
    "frontend/src/datasets/DatasetResults.tsx",
    "frontend/src/datasets/IndexedLibraryResults.test.tsx",
    "frontend/src/datasets/IndexedLibraryResults.tsx",
    "frontend/src/datasets/ResearchTable.tsx",
    "frontend/src/datasets/del-result-layout.css",
    "frontend/src/datasets/result-viewport.css",
    "frontend/src/datasets/screening-result-layout.css",
    "server_tests/test_candidate_inspection_desktop.py",
    "server_tests/test_del_desktop_review.py",
}
SCREENING_DESKTOP_DIFF = "28057b16114b62f0fdb86680eb0fee00f85e55eaaa314cbbdd921c45367e6ddb"
RESULT_THEME_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/datasets/CandidateView.css",
    "frontend/src/datasets/candidate-table.css",
    "frontend/src/datasets/datasets.css",
    "frontend/src/datasets/del-result-layout.css",
    "frontend/src/datasets/screening-result-layout.css",
    "frontend/src/viewer/chain-controls.css",
    "server_tests/test_native_result_theme_browser.py",
    "tests/test_molecular_utility_scope.py",
}
RESULT_THEME_DIFF = "05e73fb8725f59ca0e348580817ef4a34839574d27a5b8f9a830749d349848ea"
DESKTOP_RESULT_LAYOUT_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/datasets/IndexedLibraryResults.tsx",
    "frontend/src/datasets/del-result-layout.css",
    "frontend/src/datasets/result-viewport.css",
    "frontend/src/datasets/screening-result-layout.css",
    "frontend/src/integrations/interaction-workspace.css",
    "server_tests/test_compact_result_header_browser.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_RESULT_LAYOUT_DIFF = "d521c2d7023300a7e341080a4373c6c28bc5d41d085b3a38b5763ad8c4fb87c0"
DEL_DESKTOP_FILES = {
    ".github/workflows/dataset-discovery-checks.yml",
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/library-member-checks.yml",
    ".github/workflows/molecular-preview-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/windows-capacity-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/datasets/CandidateTable.tsx",
    "frontend/src/datasets/CandidateView.tsx",
    "frontend/src/datasets/DatasetResults.test.tsx",
    "frontend/src/datasets/DatasetResults.tsx",
    "frontend/src/datasets/ResearchTable.tsx",
    "frontend/src/datasets/del-result-layout.css",
    "frontend/src/presentation/MolecularPreview.tsx",
    "server_tests/test_del_desktop_review.py",
    "tests/test_molecular_utility_scope.py",
}
DEL_DESKTOP_DIFF = "b86d8f29cf59a255ab692dddb78e5171aa59e64c519dc6467b1b648fa271bcd3"
DEL_RESULT_WORKSPACES_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/datasets/DELSeriesContext.test.tsx",
    "frontend/src/datasets/DELSeriesContext.tsx",
    "frontend/src/datasets/DatasetResults.test.tsx",
    "frontend/src/datasets/DatasetResults.tsx",
    "frontend/src/datasets/del-result-layout.css",
    "server_tests/test_del_desktop_review.py",
    "tests/test_molecular_utility_scope.py",
}
DEL_RESULT_WORKSPACES_DIFF = "092505d6d4d62f9734076e3ea7a514d971e93e43173f7b93cb1d40a915e4a3a8"
DEL_MEDIUM_DESKTOP_FILES = {
    "frontend/src/datasets/DatasetResults.test.tsx",
    "frontend/src/datasets/DatasetResults.tsx",
    "frontend/src/datasets/IndexedLibraryResults.tsx",
    "frontend/src/datasets/ResearchTable.tsx",
    "frontend/src/datasets/del-result-layout.css",
    "frontend/src/datasets/result-viewport.css",
    "server_tests/test_del_desktop_review.py",
}
DEL_MEDIUM_DESKTOP_DIFF = "f52e7700155deff219a35eacd18b61c1bb451d532871dfdd48eb972498f59cb0"
SIMULATION_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/simulation-checks.yml",
    ".github/workflows/simulation-view-checks.yml",
    "frontend/package-lock.json",
    "frontend/src/simulations/BoundPoseComparison.tsx",
    "frontend/src/simulations/DynamicsAnalysis.tsx",
    "frontend/src/simulations/DynamicsResults.tsx",
    "frontend/src/simulations/FreeEnergyResults.tsx",
    "frontend/src/simulations/MolecularViewport.tsx",
    "frontend/src/simulations/SimulationResults.test.tsx",
    "frontend/src/simulations/TrajectoryControls.tsx",
    "frontend/src/simulations/result-workspace.css",
    "frontend/src/simulations/simulations.css",
    "server_tests/test_native_molstar_framing.py",
    "server_tests/test_native_simulation_views.py",
    "tests/test_molecular_utility_scope.py",
}
SIMULATION_DESKTOP_DIFF = "46cab4e0f2275f0565306b469a7691bc4834f9159298cb93aac58c88bf5a6533"
SIMULATION_SHORT_REVIEW_FILES = {
    ".github/workflows/simulation-checks.yml",
    ".github/workflows/simulation-view-checks.yml",
    ".github/workflows/windows-capacity-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/simulations/BoundPoseComparison.tsx",
    "frontend/src/simulations/DynamicsResults.tsx",
    "frontend/src/simulations/FreeEnergyResults.tsx",
    "frontend/src/simulations/MolecularViewport.tsx",
    "frontend/src/simulations/TrajectoryControls.tsx",
    "frontend/src/simulations/molecular-first-draw.test.ts",
    "frontend/src/simulations/molecular-first-draw.ts",
    "frontend/src/simulations/molstar-controller.ts",
    "frontend/src/simulations/result-workspace.css",
    "server_tests/test_native_molstar_framing.py",
    "server_tests/test_short_simulation_review.py",
    "tests/test_molecular_utility_scope.py",
}
SIMULATION_SHORT_REVIEW_DIFF = "eac50d447ca7c6da6f0fb7a5e698be215c86d2cc7c94754bcff4cfe7bef9b11e"
SIMULATION_FOCUS_FILES = {
    ".github/workflows/simulation-view-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/presentation/WorkspaceFullscreenControl.test.tsx",
    "frontend/src/presentation/WorkspaceFullscreenControl.tsx",
    "frontend/src/presentation/workspace-fullscreen.css",
    "frontend/src/presentation/workspace-structure-focus.ts",
    "frontend/src/simulations/BoundPoseComparison.tsx",
    "frontend/src/simulations/DynamicsResults.tsx",
    "frontend/src/simulations/MolecularViewport.tsx",
    "frontend/src/simulations/pose-comparison.css",
    "server_tests/test_native_simulation_views.py",
    "server_tests/test_simulation_structure_focus.py",
}
SIMULATION_FOCUS_DIFF = "30d08f539a843ad3ea00d209b1e4f0c06e15d2166607e37fdef9cceb209cd329"
PROXIMITY_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/proximity-checks.yml",
    "frontend/src/proximity/AttachmentDirections.tsx",
    "frontend/src/proximity/Results.tsx",
    "frontend/src/proximity/Results.test.tsx",
    "frontend/src/proximity/ResultsPreview.tsx",
    "frontend/src/proximity/proximity.css",
    "server_tests/test_proximity_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_COMPLEX_REVIEW_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/proximity-checks.yml",
    ".github/workflows/viewer-checks.yml",
    "frontend/src/presentation/spatial-result-review.css",
    "frontend/src/presentation/workspace-expansion.ts",
    "frontend/src/proximity/Results.tsx",
    "frontend/src/proximity/proximity.css",
    "frontend/src/receptors/ReceptorResults.tsx",
    "frontend/src/receptors/receptors.css",
    "frontend/src/studio/Header.tsx",
    "frontend/src/studio/header.css",
    "frontend/src/viewer/viewer-tool-group.css",
    "server_tests/test_navigation_shell_browser.py",
    "server_tests/test_proximity_desktop.py",
    "server_tests/test_receptor_workspace_browser.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_COMPLEX_REVIEW_DIFF = "d1c23268559e84c23d7fae887c2979eead1610e3cc7976f947a790fe7bce71c8"
PROXIMITY_DESKTOP_DIFF = "9cb76c048bcdf962e004a89833a760c7484c3a8fe56f46a27ef0c70ad02edb30"
PROXIMITY_PAIR_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/proximity-checks.yml",
    ".github/workflows/publication-checks.yml",
    "docs/user-guide.md",
    "frontend/src/proximity/AssemblyComparison.tsx",
    "frontend/src/proximity/AssemblyFiles.tsx",
    "frontend/src/proximity/Results.tsx",
    "frontend/src/proximity/Results.test.tsx",
    "frontend/src/proximity/ResultsPreview.tsx",
    "frontend/src/proximity/proximity.css",
    "frontend/src/proximity/useAssemblyComparison.ts",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/ViewerExportActions.tsx",
    "server_tests/test_proximity_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
PROXIMITY_PAIR_DIFF = "ec4abb3394b7f7290a6dcecba8cf2cdcbc0a3f6a525e097669049b763504ff03"
ALIGNED_COMPARISON_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/protein-interface-checks.yml",
    ".github/workflows/publication-checks.yml",
    ".github/workflows/structure-comparison-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/presentation/SpatialResultSummary.tsx",
    "frontend/src/presentation/VerifiedArtifactDownload.tsx",
    "frontend/src/structure-comparison/AlignedStructurePair.tsx",
    "frontend/src/structure-comparison/ComparisonFiles.tsx",
    "frontend/src/structure-comparison/ComparisonPreview.tsx",
    "frontend/src/structure-comparison/ComparisonResults.tsx",
    "frontend/src/structure-comparison/ComparisonScene.test.ts",
    "frontend/src/structure-comparison/comparison-result-view.css",
    "frontend/src/structure-comparison/useComparisonView.ts",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/ViewerExportActions.tsx",
    "frontend/src/viewer/frame.ts",
    "frontend/src/viewer/modified-polymer.ts",
    "frontend/src/viewer/source-layout.test.ts",
    "frontend/src/viewer/source-layout.ts",
    "frontend/src/viewer/structure-camera.test.tsx",
    "frontend/src/viewer/structure-camera.ts",
    "frontend/src/viewer/useStructureCamera.ts",
    "scripts/comparison-layout-scope.py",
    "server_tests/test_archived_comparison_browser.py",
    "tests/test_molecular_utility_scope.py",
}
ALIGNED_COMPARISON_DIFF = "30709bb86b677931b8da5c0b16cf5ae6f2d4f166bc75cb947aa3a3e5fef93a63"
UTILITY_RESULT_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/guided/Questionnaire.tsx",
    "frontend/src/guided/TaskPresentation.tsx",
    "frontend/src/utilities/UtilityImageTask.test.tsx",
    "frontend/src/utilities/UtilitySinglePage.test.tsx",
    "frontend/src/utilities/UtilityTask.tsx",
    "frontend/src/utilities/UtilityTaskResult.tsx",
    "frontend/src/utilities/UtilityWorkspace.tsx",
    "frontend/src/utilities/utility-task.css",
    "server_tests/test_utility_result_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
UTILITY_RESULT_DESKTOP_DIFF = "fb5f54ef07da82c9a1d62e451534535e8c0f735ff99ea82f65a741a05286da1a"
RESULT_HANDOFF_DESKTOP_FILES = {
    "frontend/src/App.tsx",
    "frontend/src/App.test.tsx",
    "frontend/src/guided/InputActionScope.tsx",
    "frontend/src/guided/useInputTaskSubmit.ts",
    "frontend/src/operations/useTaskSubmit.ts",
    "frontend/src/operations/useTaskSubmit.test.ts",
    "frontend/src/studio/ModuleWorkspaceNavigation.tsx",
    ".github/workflows/task-action-checks.yml",
    "frontend/src/TaskDetail.tsx",
    "frontend/src/studio/TaskHistoryToolbar.tsx",
    "frontend/src/studio/TaskWorkspace.tsx",
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/admet/AdmetResults.test.tsx",
    "frontend/src/admet/AdmetResults.tsx",
    "frontend/src/admet/AdmetSelectedMolecule.tsx",
    "frontend/src/admet/admet.css",
    "frontend/src/chemistry/LibraryScreenResults.test.tsx",
    "frontend/src/chemistry/LibraryScreenResults.tsx",
    "frontend/src/chemistry/LibraryScreenSelection.tsx",
    "frontend/src/chemistry/StatePreparationHandoff.test.tsx",
    "frontend/src/chemistry/StatePreparationHandoff.tsx",
    "frontend/src/chemistry/library-screen-results.css",
    "frontend/src/chemistry/result-preparation.css",
    "frontend/src/utilities/utility-task.css",
    "server_tests/test_result_handoffs_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
RESULT_HANDOFF_DESKTOP_DIFF = "6772a9ca4bfb448068e72e9d4ea121c0d2028c5f7cb55bdc28446f51d2edd567"
DESKTOP_MOLECULE_RESULTS_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/property-preview-checks.yml",
    "frontend/src/chemistry/LibraryScreenRecords.tsx",
    "frontend/src/chemistry/LibraryScreenResults.test.tsx",
    "frontend/src/chemistry/LibraryScreenResults.tsx",
    "frontend/src/chemistry/LibraryScreenSelection.tsx",
    "frontend/src/chemistry/library-screen-results.css",
    "frontend/src/operations/PropertyResultViews.tsx",
    "frontend/src/operations/PropertyResults.test.tsx",
    "frontend/src/operations/PropertyResults.tsx",
    "frontend/src/operations/property-result-views.css",
    "frontend/src/presentation/CandidateReviewBar.tsx",
    "server_tests/test_metric_landscape_browser.py",
    "server_tests/test_property_preview_browser.py",
    "server_tests/test_result_handoffs_desktop.py",
    "server_tests/test_utility_result_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_MOLECULE_RESULTS_DIFF = "d576f4c8e3662ea4b70bb511cf46197783f2d7d1430a6836d2d2ee3cd9d11bce"
SHORT_CHEMISTRY_DESKTOP_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "frontend/src/admet/AdmetResults.test.tsx",
    "frontend/src/admet/admet.css",
    "frontend/src/chemistry/LibraryScreenResults.test.tsx",
    "frontend/src/chemistry/LibraryScreenResults.tsx",
    "frontend/src/chemistry/StatePreparationHandoff.test.tsx",
    "frontend/src/chemistry/StatePreparationHandoff.tsx",
    "frontend/src/chemistry/library-screen-results.css",
    "frontend/src/editors/portable-smiles.test.ts",
    "frontend/src/editors/portable-smiles.ts",
    "frontend/src/operations/property-result-views.css",
    "frontend/src/utilities/recognition-host-ui-locale.ts",
    "server_tests/test_result_handoffs_desktop.py",
    "server_tests/test_short_chemistry_desktop.py",
    "src/opendde_workbench/data/recognition_locale/patch.json",
    "tests/test_molecular_utility_scope.py",
    "tests/test_recognition_companion.py",
}
SHORT_CHEMISTRY_DESKTOP_DIFF = "c90684d499fee396c92b25bb7b3e5c57b74dc6e7a222d06bd27df35991932c69"
DESKTOP_MOLECULE_WORKBENCH_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    "docs/user-guide.md",
    "frontend/src/admet/AdmetResults.test.tsx",
    "frontend/src/admet/AdmetSelectedMolecule.tsx",
    "frontend/src/admet/admet.css",
    "frontend/src/operations/OperationResults.tsx",
    "frontend/src/operations/PropertyResults.test.tsx",
    "frontend/src/operations/PropertyResults.tsx",
    "frontend/src/operations/property-result-views.css",
    "frontend/src/presentation/MolecularPreview.tsx",
    "frontend/src/presentation/MoleculeResultToolbar.tsx",
    "frontend/src/presentation/ResearchTabs.test.tsx",
    "frontend/src/presentation/ResearchTabs.tsx",
    "frontend/src/presentation/molecule-result-toolbar.css",
    "frontend/src/presentation/research-tabs.css",
    "scripts/research-tabs-scope.py",
    "server_tests/test_result_handoffs_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_MOLECULE_WORKBENCH_DIFF = "2f1968fa6b1f7b31216c2994f1a9014ec9c9598923cf8fc94f8951449d6a26b0"
DESKTOP_LIGAND_CAMERA_FILES = {
    ".github/workflows/generated-candidate-checks.yml",
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/publication-checks.yml",
    "docs/user-guide.md",
    "frontend/src/viewer/camera-resize.test.ts",
    "frontend/src/viewer/camera-resize.ts",
    "frontend/src/viewer/capture.test.ts",
    "frontend/src/viewer/capture.ts",
    "frontend/src/viewer/frame.ts",
    "frontend/src/viewer/ligand-framing.test.ts",
    "frontend/src/viewer/ligand-framing.ts",
    "server_tests/test_result_handoffs_desktop.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_LIGAND_CAMERA_DIFF = "b75bee113da22ac302f3217269e0bc9608d5f4ac1c859f4c5d702ea889e0a9f5"
DESKTOP_STRUCTURE_FOCUS_FILES = {
    ".github/workflows/molecular-utility-checks.yml",
    ".github/workflows/publication-checks.yml",
    "docs/frontend-layout.md",
    "frontend/src/presentation/WorkspaceFullscreenControl.test.tsx",
    "frontend/src/presentation/WorkspaceFullscreenControl.tsx",
    "frontend/src/presentation/useWorkspaceFullscreen.ts",
    "frontend/src/presentation/workspace-expansion.ts",
    "frontend/src/presentation/workspace-fullscreen.css",
    "frontend/src/presentation/workspace-structure-focus.ts",
    "frontend/src/viewer/ViewerExportActions.tsx",
    "server_tests/test_workspace_fullscreen_browser.py",
    "tests/test_molecular_utility_scope.py",
}
DESKTOP_STRUCTURE_FOCUS_DIFF = "88474b366eef4a88030b9446e5a5511b02ce57a160f300fb3667e923f8723f10"
RUNTIME_ENTRY_FILES = {
    "frontend/src/studio/EnvironmentStatusTable.tsx",
    "frontend/src/studio/RuntimeStatus.test.tsx",
    "frontend/src/studio/RuntimeStatus.tsx",
    "frontend/src/studio/runtime-status.css",
    "server_tests/test_runtime_entry_browser.py",
}
RUNTIME_ENTRY_DIFF = "6e7152758698c956a3e587c6e04e9aa9a2da4b1b8b439c4a57bf4a35a232b3d7"
MODULE_POWER_CONSUMERS = (
    MODULE_POWER_FILES | INLINE_MODULE_POWER_FILES | RESULT_MODULE_POWER_FILES
    | CONTEXTUAL_BACKEND_PANEL_FILES
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


def aligned_comparison_selected(changed, event, base):
    return reviewed_selected(
        changed, event, base, ALIGNED_COMPARISON_FILES, ALIGNED_COMPARISON_DIFF,
        scope_pin="ALIGNED_COMPARISON_DIFF",
    )


def main():
    base = os.environ.get("BASE", "")
    if os.environ.get("GITHUB_REF_NAME", "main") != "main":
        base = subprocess.check_output(
            ["git", "merge-base", "origin/main", "HEAD"], text=True
        ).strip()
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", base, "HEAD"], text=True
    ).splitlines() if base and set(base) != {"0"} else []
    simulation_focus = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SIMULATION_FOCUS_FILES, SIMULATION_FOCUS_DIFF, scope_pin="SIMULATION_FOCUS_DIFF",
    )
    desktop_structure_focus = simulation_focus or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_STRUCTURE_FOCUS_FILES, DESKTOP_STRUCTURE_FOCUS_DIFF,
        scope_pin="DESKTOP_STRUCTURE_FOCUS_DIFF",
    )
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
    recognition_access = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RECOGNITION_ACCESS_FILES, RECOGNITION_ACCESS_DIFF, scope_pin="RECOGNITION_ACCESS_DIFF",
    )
    recognition_entry = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RECOGNITION_ENTRY_FILES, RECOGNITION_ENTRY_DIFF, scope_pin="RECOGNITION_ENTRY_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RECOGNITION_PANEL_POWER_FILES, RECOGNITION_PANEL_POWER_DIFF,
        scope_pin="RECOGNITION_PANEL_POWER_DIFF",
    ) or bool(changed and set(changed) <= NATIVE_RECOGNITION_POWER_FILES)
    persistent_task_power = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PERSISTENT_TASK_POWER_FILES, PERSISTENT_TASK_POWER_DIFF,
        scope_pin="PERSISTENT_TASK_POWER_DIFF",
    )
    task_power = persistent_task_power or reviewed_selected(
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
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        BACKEND_STATE_FILES, BACKEND_STATE_DIFF, scope_pin="BACKEND_STATE_DIFF",
    )
    desktop_backend_header = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_BACKEND_HEADER_FILES, DESKTOP_BACKEND_HEADER_DIFF,
        scope_pin="DESKTOP_BACKEND_HEADER_DIFF",
    )
    module_power = (
        desktop_backend_header or persistent_task_power or backend_setup or composed_power
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        STABLE_MODULE_SWITCH_FILES, STABLE_MODULE_SWITCH_DIFF,
        scope_pin="STABLE_MODULE_SWITCH_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        MODULE_POWER_FILES, MODULE_POWER_DIFF,
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        INLINE_MODULE_POWER_FILES, INLINE_MODULE_POWER_DIFF,
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RESULT_MODULE_POWER_FILES, RESULT_MODULE_POWER_DIFF,
        scope_pin="RESULT_MODULE_POWER_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        MODULE_POWER_ENTRY_FILES, MODULE_POWER_ENTRY_DIFF,
        scope_pin="MODULE_POWER_ENTRY_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        CONTEXTUAL_BACKEND_PANEL_FILES, CONTEXTUAL_BACKEND_PANEL_DIFF,
        scope_pin="CONTEXTUAL_BACKEND_PANEL_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        FUNCTION_POWER_FILES, FUNCTION_POWER_DIFF,
        scope_pin="FUNCTION_POWER_DIFF",
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
    desktop_complex_review = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_COMPLEX_REVIEW_FILES, DESKTOP_COMPLEX_REVIEW_DIFF,
        scope_pin="DESKTOP_COMPLEX_REVIEW_DIFF",
    )
    desktop_header = desktop_complex_review or desktop_backend_header or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_HEADER_FILES, DESKTOP_HEADER_DIFF,
    )
    initial_pose_power = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        INITIAL_POSE_POWER_FILES, INITIAL_POSE_POWER_DIFF,
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        INITIAL_POSE_RECOVERY_FILES, INITIAL_POSE_RECOVERY_DIFF,
        scope_pin="INITIAL_POSE_RECOVERY_DIFF",
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
        UTILITY_DESKTOP_FILES, UTILITY_DESKTOP_DIFF, scope_pin="UTILITY_DESKTOP_DIFF",
    )
    desktop_help = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_HELP_FILES, DESKTOP_HELP_DIFF, scope_pin="DESKTOP_HELP_DIFF",
    )
    refinement_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        REFINEMENT_DESKTOP_FILES, REFINEMENT_DESKTOP_DIFF, scope_pin="REFINEMENT_DESKTOP_DIFF",
    )
    short_paired_comparison = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SHORT_PAIRED_COMPARISON_FILES, SHORT_PAIRED_COMPARISON_DIFF,
        scope_pin="SHORT_PAIRED_COMPARISON_DIFF",
    )
    short_structure_review = short_paired_comparison or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SHORT_STRUCTURE_REVIEW_FILES, SHORT_STRUCTURE_REVIEW_DIFF,
        scope_pin="SHORT_STRUCTURE_REVIEW_DIFF",
    )
    spatial_review = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SPATIAL_REVIEW_FILES, SPATIAL_REVIEW_DIFF, scope_pin="SPATIAL_REVIEW_DIFF",
    )
    spatial_desktop = spatial_review or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SPATIAL_DESKTOP_FILES, SPATIAL_DESKTOP_DIFF, scope_pin="SPATIAL_DESKTOP_DIFF",
    )
    sequence_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SEQUENCE_DESKTOP_FILES, SEQUENCE_DESKTOP_DIFF, scope_pin="SEQUENCE_DESKTOP_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SEQUENCE_COMPARISON_FILES, SEQUENCE_COMPARISON_DIFF,
        scope_pin="SEQUENCE_COMPARISON_DIFF",
    )
    protein_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PROTEIN_DESKTOP_FILES, PROTEIN_DESKTOP_DIFF, scope_pin="PROTEIN_DESKTOP_DIFF",
    )
    history_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        HISTORY_DESKTOP_FILES, HISTORY_DESKTOP_DIFF, scope_pin="HISTORY_DESKTOP_DIFF",
    )
    screening_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SCREENING_DESKTOP_FILES, SCREENING_DESKTOP_DIFF, scope_pin="SCREENING_DESKTOP_DIFF",
    )
    result_theme = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RESULT_THEME_FILES, RESULT_THEME_DIFF, scope_pin="RESULT_THEME_DIFF",
    )
    desktop_result_layout = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_RESULT_LAYOUT_FILES, DESKTOP_RESULT_LAYOUT_DIFF,
        scope_pin="DESKTOP_RESULT_LAYOUT_DIFF",
    )
    candidate_desktop = (
        desktop_result_layout or result_theme or screening_desktop or reviewed_selected(
            set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
            CANDIDATE_DESKTOP_FILES, CANDIDATE_DESKTOP_DIFF, scope_pin="CANDIDATE_DESKTOP_DIFF",
        )
    )
    del_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DEL_DESKTOP_FILES, DEL_DESKTOP_DIFF, scope_pin="DEL_DESKTOP_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DEL_RESULT_WORKSPACES_FILES, DEL_RESULT_WORKSPACES_DIFF,
        scope_pin="DEL_RESULT_WORKSPACES_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DEL_MEDIUM_DESKTOP_FILES, DEL_MEDIUM_DESKTOP_DIFF, scope_pin="DEL_MEDIUM_DESKTOP_DIFF",
    )
    simulation_desktop = simulation_focus or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SIMULATION_DESKTOP_FILES, SIMULATION_DESKTOP_DIFF, scope_pin="SIMULATION_DESKTOP_DIFF",
    )
    simulation_desktop = simulation_desktop or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SIMULATION_SHORT_REVIEW_FILES, SIMULATION_SHORT_REVIEW_DIFF,
        scope_pin="SIMULATION_SHORT_REVIEW_DIFF",
    )
    proximity_desktop = desktop_complex_review or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PROXIMITY_DESKTOP_FILES, PROXIMITY_DESKTOP_DIFF, scope_pin="PROXIMITY_DESKTOP_DIFF",
    ) or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PROXIMITY_PAIR_FILES, PROXIMITY_PAIR_DIFF, scope_pin="PROXIMITY_PAIR_DIFF",
    )
    utility_result_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        UTILITY_RESULT_DESKTOP_FILES, UTILITY_RESULT_DESKTOP_DIFF,
        scope_pin="UTILITY_RESULT_DESKTOP_DIFF",
    )
    runtime_entry = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RUNTIME_ENTRY_FILES, RUNTIME_ENTRY_DIFF, scope_pin="RUNTIME_ENTRY_DIFF",
    )
    molecule_workbench = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_MOLECULE_WORKBENCH_FILES, DESKTOP_MOLECULE_WORKBENCH_DIFF,
        scope_pin="DESKTOP_MOLECULE_WORKBENCH_DIFF",
    )
    short_chemistry_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        SHORT_CHEMISTRY_DESKTOP_FILES, SHORT_CHEMISTRY_DESKTOP_DIFF,
        scope_pin="SHORT_CHEMISTRY_DESKTOP_DIFF",
    )
    molecule_results = short_chemistry_desktop or molecule_workbench or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_MOLECULE_RESULTS_FILES, DESKTOP_MOLECULE_RESULTS_DIFF,
        scope_pin="DESKTOP_MOLECULE_RESULTS_DIFF",
    )
    ligand_camera = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        DESKTOP_LIGAND_CAMERA_FILES, DESKTOP_LIGAND_CAMERA_DIFF,
        scope_pin="DESKTOP_LIGAND_CAMERA_DIFF",
    )
    result_handoff_desktop = molecule_results or ligand_camera or reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        RESULT_HANDOFF_DESKTOP_FILES, RESULT_HANDOFF_DESKTOP_DIFF,
        scope_pin="RESULT_HANDOFF_DESKTOP_DIFF",
    )
    inline_recognition = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        INLINE_RECOGNITION_FILES, INLINE_RECOGNITION_DIFF,
        scope_pin="INLINE_RECOGNITION_DIFF",
    )
    editor_drawing = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        EDITOR_DRAWING_FILES, EDITOR_DRAWING_DIFF, scope_pin="EDITOR_DRAWING_DIFF",
    )
    portable_smiles = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PORTABLE_SMILES_FILES, PORTABLE_SMILES_DIFF, scope_pin="PORTABLE_SMILES_DIFF",
    )
    guided_desktop = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        GUIDED_DESKTOP_FILES, GUIDED_DESKTOP_DIFF, scope_pin="GUIDED_DESKTOP_DIFF",
    )
    utility_query = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        UTILITY_QUERY_FILES, UTILITY_QUERY_DIFF, scope_pin="UTILITY_QUERY_DIFF",
    )
    compact_material = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        COMPACT_MATERIAL_FILES, COMPACT_MATERIAL_DIFF, scope_pin="COMPACT_MATERIAL_DIFF",
    )
    paired_figure = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        PAIRED_FIGURE_FILES, PAIRED_FIGURE_DIFF, scope_pin="PAIRED_FIGURE_DIFF",
    )
    native_color_figure = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        NATIVE_COLOR_FIGURE_FILES, NATIVE_COLOR_FIGURE_DIFF,
        scope_pin="NATIVE_COLOR_FIGURE_DIFF",
    )
    archived_pose_review = reviewed_selected(
        set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        ARCHIVED_POSE_REVIEW_FILES, ARCHIVED_POSE_REVIEW_DIFF,
        scope_pin="ARCHIVED_POSE_REVIEW_DIFF",
    )
    prediction_input_layout = (
        "frontend/src/guided/desktop-questionnaire.css" in changed
        and run_path(str(Path(__file__).with_name("prediction-workspace-scope.py")))[
            "input_preview_only"
        ](changed, os.environ.get("GITHUB_EVENT_NAME", "push"))
    )
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        aligned_comparison = aligned_comparison_selected(
            set(changed), os.environ.get("GITHUB_EVENT_NAME"), base,
        )
        output.write("aligned_comparison_only=" + str(aligned_comparison).lower() + "\n")
        output.write("inline_recognition_only=" + str(inline_recognition).lower() + "\n")
        output.write("editor_drawing_only=" + str(editor_drawing).lower() + "\n")
        output.write("portable_smiles_only=" + str(portable_smiles).lower() + "\n")
        output.write("archived_pose_review_only=" + str(archived_pose_review).lower() + "\n")
        output.write("guided_desktop_only=" + str(guided_desktop).lower() + "\n")
        output.write("prediction_input_layout=" + str(prediction_input_layout).lower() + "\n")
        output.write("utility_query_only=" + str(utility_query).lower() + "\n")
        output.write("compact_material_only=" + str(compact_material).lower() + "\n")
        output.write("paired_figure_only=" + str(paired_figure).lower() + "\n")
        output.write("native_color_figure_only=" + str(native_color_figure).lower() + "\n")
        output.write("result_handoff_desktop_only=" + str(result_handoff_desktop).lower() + "\n")
        output.write("molecule_results_only=" + str(molecule_results).lower() + "\n")
        output.write("short_chemistry_desktop_only=" + str(short_chemistry_desktop).lower() + "\n")
        output.write("molecule_workbench_only=" + str(molecule_workbench).lower() + "\n")
        output.write("ligand_camera_only=" + str(ligand_camera).lower() + "\n")
        output.write("desktop_structure_focus_only=" + str(desktop_structure_focus).lower() + "\n")
        output.write("runtime_entry_only=" + str(runtime_entry).lower() + "\n")
        output.write("utility_result_desktop_only=" + str(utility_result_desktop).lower() + "\n")
        output.write("proximity_desktop_only=" + str(proximity_desktop).lower() + "\n")
        output.write("simulation_desktop_only=" + str(simulation_desktop).lower() + "\n")
        output.write("candidate_desktop_only=" + str(candidate_desktop).lower() + "\n")
        output.write("screening_desktop_only=" + str(screening_desktop).lower() + "\n")
        output.write("del_desktop_only=" + str(del_desktop).lower() + "\n")
        output.write("result_theme_only=" + str(result_theme).lower() + "\n")
        output.write("desktop_result_layout_only=" + str(desktop_result_layout).lower() + "\n")
        output.write("history_desktop_only=" + str(history_desktop).lower() + "\n")
        output.write("initial_pose_power_only=" + str(initial_pose_power).lower() + "\n")
        output.write("backend_placement_only=" + str(backend_placement).lower() + "\n")
        output.write("task_power_only=" + str(task_power).lower() + "\n")
        output.write("module_backend_only=" + str(module_backend).lower() + "\n")
        output.write("module_power_only=" + str(module_power).lower() + "\n")
        output.write("composed_power_only=" + str(composed_power).lower() + "\n")
        power_changed = (
            not history_desktop
            and not desktop_result_layout
            and not desktop_complex_review
            and not result_handoff_desktop
            and not recognition_entry
            and not inline_recognition
            and (not changed or backend_setup or bool(MODULE_POWER_CONSUMERS.intersection(changed)))
        )
        output.write("module_power_changed=" + str(power_changed).lower() + "\n")
        output.write("recognition_entry_only=" + str(recognition_entry).lower() + "\n")
        output.write("native_state_only=" + str(native_state).lower() + "\n")
        output.write("compact_example_only=" + str(compact_example).lower() + "\n")
        output.write("mobile_header_only=" + str(mobile_header).lower() + "\n")
        output.write("desktop_header_only=" + str(desktop_header).lower() + "\n")
        output.write("desktop_complex_review_only=" + str(desktop_complex_review).lower() + "\n")
        output.write("mobile_viewer_only=" + str(mobile_viewer).lower() + "\n")
        output.write("print_labels_only=" + str(print_labels).lower() + "\n")
        output.write("recognition_power_only=" + str(recognition_power).lower() + "\n")
        output.write("recognition_access_only=" + str(recognition_access).lower() + "\n")
        output.write("potential_display_only=" + str(potential_display).lower() + "\n")
        output.write("utility_navigation_only=" + str(navigation).lower() + "\n")
        output.write("utility_desktop_only=" + str(utility_desktop).lower() + "\n")
        output.write("desktop_help_only=" + str(desktop_help).lower() + "\n")
        output.write("refinement_desktop_only=" + str(refinement_desktop).lower() + "\n")
        output.write("spatial_desktop_only=" + str(spatial_desktop).lower() + "\n")
        output.write("spatial_review_only=" + str(spatial_review).lower() + "\n")
        output.write("short_structure_review_only=" + str(short_structure_review).lower() + "\n")
        output.write("short_paired_comparison_only=" + str(short_paired_comparison).lower() + "\n")
        output.write("sequence_desktop_only=" + str(sequence_desktop).lower() + "\n")
        output.write("protein_desktop_only=" + str(protein_desktop).lower() + "\n")
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
            recognition_entry or recognition_power or recognition_access
            or potential_display or navigation
            or runtime or layout
            or native_state or compact_example or mobile_header or desktop_header
            or initial_pose_power
            or mobile_viewer or print_labels or utility_desktop or desktop_help
            or refinement_desktop or spatial_desktop or sequence_desktop or protein_desktop
            or short_structure_review
            or history_desktop or candidate_desktop or simulation_desktop or proximity_desktop
            or del_desktop or utility_result_desktop or runtime_entry or result_handoff_desktop
            or desktop_structure_focus
            or aligned_comparison
            or inline_recognition
            or editor_drawing
            or portable_smiles
            or guided_desktop
            or utility_query
            or compact_material
            or paired_figure
            or native_color_figure
            or archived_pose_review
            or selected(changed, event, shared=shared)
        )
        output.write("runtime_switch_only=" + str(runtime).lower() + "\n")
        output.write("result_header_only=" + str(layout).lower() + "\n")
        output.write("utility_only=" + str(utility).lower() + "\n")


if __name__ == "__main__":
    main()
