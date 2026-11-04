"""Delegate a bounded prediction-presentation batch to its exact browser/consumer gate."""

import fnmatch
import os
import subprocess

PATTERNS = (
    "frontend/public/fonts/plus-jakarta/*",
    "frontend/src/presentation/Prediction*",
    "frontend/src/presentation/prediction-*.css",
    "frontend/src/presentation/prediction-heading-focus*",
    "frontend/src/presentation/prediction-settings-summary.ts",
    "frontend/src/viewer/confidence-*",
    "frontend/src/viewer/ConfidenceControls*",
    "frontend/src/viewer/structure-bytes*",
    "frontend/src/operations/confidence-*",
    "frontend/src/presentation/plots/InteractivePlot*",
    "src/opendde_workbench/confidence_binding.py",
    "src/opendde_workbench/confidence.py",
    "tests/test_confidence_binding.py",
    "tests/test_import_confidence.py",
    "server_tests/native_confidence_case.py",
    "server_tests/test_native_confidence_browser.py",
    "frontend/src/viewer/ChainControls*",
    "frontend/src/viewer/chain-controls.css",
    "frontend/src/viewer/chain-visibility*",
    "frontend/src/viewer/StructureViewport.tsx",
    "frontend/src/viewer/StructureViewer.test.tsx",
    "frontend/src/viewer/scene.ts",
    "frontend/src/viewer/frame.ts",
    "frontend/src/viewer/style.test.ts",
    "frontend/src/viewer/style.ts",
    "frontend/src/viewer/protocol.ts",
    "frontend/src/viewer/StructureInspection*",
    "frontend/src/viewer/structure-inspection.css",
    "frontend/src/viewer/polymer-detail.ts",
    "frontend/src/viewer/residue-selection*",
    "frontend/src/viewer/display-readiness*",
    "frontend/src/integrations/prediction-presentation*",
    "frontend/src/integrations/Mol1Form.tsx",
    "frontend/src/integrations/Mol1Confidence.tsx",
    "frontend/src/integrations/ScientificForm.tsx",
    "frontend/src/integrations/ScientificResults.tsx",
    "frontend/src/studio/PredictionResults.tsx",
    "frontend/src/studio/PredictionResults.test.tsx",
    "frontend/src/studio/HomeWorkspace.test.tsx",
    "frontend/src/studio/Header.tsx",
    "frontend/src/operations/ConfidencePanel*",
    "frontend/src/guided/MolecularInputs.tsx",
    "frontend/src/guided/MolecularInputs.test.tsx",
    "frontend/src/TaskForm.tsx",
    "frontend/src/App.tsx",
    "server_tests/prediction_workspace_case.py",
    "server_tests/test_prediction_workspace_browser.py",
    "server_tests/test_prediction_input_preview_browser.py",
    "server_tests/test_prediction_entry_browser.py",
    "server_tests/test_template_controls_browser.py",
    "server_tests/test_ensemble_results_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    ".github/workflows/task-layout-checks.yml",
    ".github/workflows/user-interface-checks.yml",
    ".github/workflows/structure-layout-checks.yml",
    ".github/workflows/landscape-checks.yml",
    "docs/frontend-layout.md",
    "docs/quality/frontend.md",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)

INPUT_PREVIEW_FILES = {
    "frontend/src/presentation/PredictionSetup.tsx",
    "frontend/src/presentation/PredictionInputPreview.tsx",
    "frontend/src/presentation/PredictionEntityPreview.tsx",
    "frontend/src/presentation/PredictionInputPreview.test.tsx",
    "frontend/src/presentation/prediction-input-preview.css",
    "frontend/src/integrations/ScientificForm.tsx",
    "server_tests/test_prediction_input_preview_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


DRAFT_FILES = {
    "frontend/src/presentation/prediction-settings-summary.ts",
    "frontend/src/presentation/PredictionSetup.test.tsx",
    "frontend/src/presentation/PredictionInputPreview.tsx",
    "frontend/src/presentation/PredictionInputPreview.test.tsx",
    ".github/workflows/docking-runtime-checks.yml",
    "frontend/src/presentation/PredictionSetup.tsx",
    "frontend/src/presentation/PredictionDraftControls.tsx",
    "frontend/src/presentation/PredictionDraftList.tsx",
    "frontend/src/presentation/PredictionDraftControls.test.tsx",
    "frontend/src/presentation/prediction-draft-model.ts",
    "frontend/src/presentation/prediction-drafts.css",
    "frontend/src/integrations/Mol1Form.tsx",
    "frontend/src/integrations/Mol1Settings.tsx",
    "src/opendde_workbench/api.py",
    "src/opendde_workbench/assets.py",
    "src/opendde_workbench/drafts/__init__.py",
    "src/opendde_workbench/drafts/models.py",
    "src/opendde_workbench/drafts/storage.py",
    "src/opendde_workbench/drafts/routes.py",
    "tests/test_prediction_drafts.py",
    "server_tests/test_prediction_drafts_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


FINAL_REVIEW_FILES = {
    ".github/workflows/mol1-restraint-checks.yml",
    "frontend/src/integrations/Mol1Form.tsx",
    "frontend/src/integrations/Mol1Form.test.tsx",
    "frontend/src/integrations/Mol1JobReview.tsx",
    "frontend/src/integrations/mol1-job-request.ts",
    "frontend/src/integrations/mol1-job-request.test.ts",
    "frontend/src/integrations/mol1-job-review.css",
    "frontend/src/guided/Questionnaire.tsx",
    "frontend/src/presentation/PredictionInputPreview.tsx",
    "frontend/src/presentation/PredictionEntityPreview.tsx",
    "frontend/src/presentation/PredictionReviewDialog.tsx",
    "server_tests/test_mol1_final_review_browser.py",
    "server_tests/test_mol1_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


BOLTZ_REVIEW_FILES = FINAL_REVIEW_FILES | {
    "frontend/src/integrations/BoltzInputs.tsx",
    "frontend/src/integrations/BoltzInputs.test.tsx",
    "frontend/src/integrations/ScientificInputs.tsx",
    "frontend/src/integrations/BoltzJobReview.tsx",
    "frontend/src/integrations/boltz-job-request.ts",
    "frontend/src/integrations/ScientificForm.tsx",
    "frontend/src/integrations/ScientificForm.test.tsx",
    "frontend/src/integrations/ScientificReview.tsx",
    "frontend/src/presentation/PredictionJobReview.tsx",
    "frontend/src/presentation/PredictionJobSettings.tsx",
    "frontend/src/presentation/PredictionInputPreview.test.tsx",
    "frontend/src/research/asset-download.ts",
    "frontend/src/presentation/prediction-job-review.css",
    "server_tests/test_boltz_final_review_browser.py",
}

OPENDDE_REVIEW_FILES = {
    "frontend/src/App.tsx",
    "frontend/src/TaskForm.tsx",
    "frontend/src/TaskForm.test.tsx",
    "frontend/src/guided/workflows.test.tsx",
    "frontend/src/operations/OpenDdeJobReview.tsx",
    "frontend/src/operations/opendde-job-request.ts",
    "frontend/src/studio/HomeWorkspace.tsx",
    "server_tests/test_opendde_final_review_browser.py",
}

FOLD_REVIEW_FILES = FINAL_REVIEW_FILES | {
    ".github/workflows/harness-input-checks.yml",
    "frontend/src/operations/FoldJobReview.tsx",
    "frontend/src/operations/fold-job-review.css",
    "frontend/src/operations/HarnessForm.tsx",
    "frontend/src/operations/HarnessFoldInputs.test.tsx",
    "frontend/src/operations/useTaskSubmit.ts",
    "frontend/src/operations/useTaskSubmit.test.ts",
    "frontend/src/presentation/PredictionJobReview.tsx",
    "server_tests/test_fold_msa_sources_browser.py",
    "server_tests/test_native_fold_chain_contract.py",
    "src/opendde_workbench/fold_review.py",
    "src/opendde_workbench/harness_chains.py",
    "src/opendde_workbench/harness_routes.py",
    "tests/test_fold_review.py",
}


DOCKING_REVIEW_ENTRYPOINTS = {
    "frontend/src/docking/DockingJobReview.tsx",
    "frontend/src/docking/docking-job-request.ts",
    "server_tests/test_docking_job_review_browser.py",
}
DOCKING_REVIEW_FILES = DOCKING_REVIEW_ENTRYPOINTS | {
    ".github/workflows/docking-runtime-checks.yml",
    "frontend/src/diffsbdd/ReviewReference.tsx",
    "frontend/src/docking/DockingForm.test.tsx",
    "frontend/src/docking/DockingForm.tsx",
    "frontend/src/docking/DockingReview.tsx",
    "frontend/src/docking/DockingReview.test.tsx",
    "server_tests/docking_browser.py",
    "frontend/src/docking/FlexibleReceptorForm.test.tsx",
    "frontend/src/docking/SearchPreview.test.tsx",
    "frontend/src/docking/SearchPreview.tsx",
    "frontend/src/docking/SearchRegion.tsx",
    "frontend/src/docking/docking-job-review.css",
    "frontend/src/viewer/search-box.ts",
    "src/opendde_workbench/asset_records.py",
    "src/opendde_workbench/chemistry/sdf_io.py",
    "tests/test_asset_record_download.py",
    "frontend/src/presentation/PredictionJobReview.tsx",
    "frontend/src/presentation/PredictionReviewDialog.tsx",
    "frontend/src/presentation/prediction-job-review.css",
    "server_tests/flexible_receptor_browser.py",
    "server_tests/flexible_receptor_questionnaire.py",
    "server_tests/test_frontend_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def docking_review_only(changed, event="push"):
    return (
        event in {"push", "pull_request"}
        and DOCKING_REVIEW_ENTRYPOINTS <= set(changed) <= DOCKING_REVIEW_FILES
    )


SPATIAL_DESIGN_REVIEW_REQUIRED = {
    "frontend/src/diffsbdd/SpatialDesignJobReview.tsx",
    "frontend/src/diffsbdd/spatial-design-review.ts",
    "server_tests/test_diff_review_browser.py",
}
SPATIAL_DESIGN_REVIEW_FILES = SPATIAL_DESIGN_REVIEW_REQUIRED | {
    ".github/workflows/prolif-contact-checks.yml",
    "frontend/src/diffsbdd/DiffForm.tsx",
    "frontend/src/diffsbdd/DiffForm.test.tsx",
    "frontend/src/diffsbdd/DiffReview.tsx",
    "frontend/src/diffsbdd/DiffTemplateReplay.test.tsx",
    "frontend/src/diffsbdd/FixedAtomPicker.tsx",
    "frontend/src/diffsbdd/SavedRegions.tsx",
    "frontend/src/diffsbdd/SavedRegions.test.tsx",
    "frontend/src/regions/useNativeIdentity.ts",
    "frontend/src/regions/useNativeIdentity.test.tsx",
    "frontend/src/diffsbdd/model.ts",
    "frontend/src/diffsbdd/PocketPicker.tsx",
    "frontend/src/diffsbdd/spatial-design-review.css",
    "docs/frontend-layout.md",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    "pyproject.toml",
    "uv.lock",
    "frontend/package.json",
    "frontend/package-lock.json",
    "install.sh",
    "install.ps1",
}


def final_review_only(changed, event="push"):
    changed = set(changed)
    return event in {"push", "pull_request"} and (
        {
            "frontend/src/integrations/Mol1Form.tsx",
            "frontend/src/integrations/Mol1JobReview.tsx",
            "server_tests/test_mol1_final_review_browser.py",
        }.issubset(changed)
        and changed.issubset(FINAL_REVIEW_FILES)
        or {
            "frontend/src/integrations/ScientificForm.tsx",
            "frontend/src/integrations/BoltzJobReview.tsx",
            "server_tests/test_boltz_final_review_browser.py",
        }.issubset(changed)
        and changed.issubset(BOLTZ_REVIEW_FILES)
        or {
            "frontend/src/TaskForm.tsx",
            "frontend/src/operations/OpenDdeJobReview.tsx",
            "server_tests/test_opendde_final_review_browser.py",
        }.issubset(changed)
        and changed.issubset(
            OPENDDE_REVIEW_FILES
            | {
                "frontend/src/presentation/PredictionJobReview.tsx",
                "scripts/prediction-workspace-scope.py",
                "tests/test_prediction_workspace_scope.py",
                ".github/workflows/prediction-workspace-checks.yml",
                "pyproject.toml",
                "uv.lock",
                "frontend/package.json",
                "frontend/package-lock.json",
                "install.sh",
                "install.ps1",
            }
        )
        or {
            "frontend/src/operations/FoldJobReview.tsx",
            "src/opendde_workbench/fold_review.py",
            "server_tests/test_fold_msa_sources_browser.py",
        }.issubset(changed)
        and changed.issubset(FOLD_REVIEW_FILES)
        or docking_review_only(changed, event)
        or SPATIAL_DESIGN_REVIEW_REQUIRED <= changed <= SPATIAL_DESIGN_REVIEW_FILES
    )


def final_review_changed(changed, event="push"):
    return event == "workflow_dispatch" or any(
        path.startswith("frontend/src/integrations/mol1-job-")
        or path
        in {
            "frontend/src/integrations/Mol1Form.tsx",
            "frontend/src/integrations/Mol1JobReview.tsx",
            "frontend/src/guided/Questionnaire.tsx",
            "frontend/src/presentation/PredictionReviewDialog.tsx",
            "frontend/src/presentation/PredictionJobReview.tsx",
            "frontend/src/presentation/PredictionJobSettings.tsx",
            "frontend/src/presentation/prediction-job-review.css",
            "server_tests/test_mol1_final_review_browser.py",
        }
        for path in changed
    )


def boltz_review_changed(changed, event="push"):
    return event == "workflow_dispatch" or any(
        path in BOLTZ_REVIEW_FILES - FINAL_REVIEW_FILES
        or path
        in {
            "frontend/src/guided/Questionnaire.tsx",
            "frontend/src/presentation/PredictionEntityPreview.tsx",
            "frontend/src/presentation/PredictionReviewDialog.tsx",
        }
        for path in changed
    )


def opendde_review_changed(changed, event="push"):
    return event == "workflow_dispatch" or any(
        path in OPENDDE_REVIEW_FILES
        or path
        in {
            "frontend/src/guided/Questionnaire.tsx",
            "frontend/src/presentation/PredictionEntityPreview.tsx",
            "frontend/src/presentation/PredictionReviewDialog.tsx",
            "frontend/src/presentation/PredictionJobReview.tsx",
            "frontend/src/presentation/PredictionJobSettings.tsx",
            "frontend/src/presentation/prediction-job-review.css",
        }
        for path in changed
    )


def drafts_only(changed, event="push"):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and {
            "frontend/src/presentation/PredictionDraftControls.tsx",
            "src/opendde_workbench/drafts/storage.py",
            "tests/test_prediction_drafts.py",
            "server_tests/test_prediction_drafts_browser.py",
        }.issubset(changed)
        and changed.issubset(DRAFT_FILES)
    )


def drafts_changed(changed, event="push"):
    return event == "workflow_dispatch" or any(
        name.startswith(
            ("src/opendde_workbench/drafts/", "frontend/src/presentation/PredictionDraft")
        )
        or name
        in {
            "frontend/src/presentation/prediction-draft-model.ts",
            "frontend/src/presentation/prediction-drafts.css",
            "frontend/src/integrations/Mol1Form.tsx",
            "frontend/src/integrations/Mol1Settings.tsx",
            "src/opendde_workbench/api.py",
            "src/opendde_workbench/assets.py",
            "tests/test_prediction_drafts.py",
            "server_tests/test_prediction_drafts_browser.py",
        }
        for name in changed
    )


def input_preview_only(changed, event="push"):
    changed = set(changed)
    return (
        event in {"push", "pull_request"}
        and {
            "frontend/src/presentation/PredictionSetup.tsx",
            "frontend/src/presentation/PredictionInputPreview.tsx",
            "frontend/src/presentation/PredictionInputPreview.test.tsx",
        }.issubset(changed)
        and changed.issubset(INPUT_PREVIEW_FILES)
    )


def preview_changed(changed, event="push"):
    return event == "workflow_dispatch" or any(
        name.startswith(
            (
                "frontend/src/presentation/PredictionSetup",
                "frontend/src/presentation/PredictionInputPreview",
                "frontend/src/presentation/PredictionEntityPreview",
                "frontend/src/presentation/PredictionReviewDialog",
            )
        )
        or name
        in {
            "frontend/src/presentation/prediction-settings-summary.ts",
            "frontend/src/research/asset-download.ts",
            "frontend/src/presentation/prediction-input-preview.css",
            "frontend/src/presentation/prediction-inputs.css",
            "frontend/src/presentation/prediction-shell.css",
            "frontend/src/presentation/prediction-workspace.css",
            "frontend/src/integrations/ScientificForm.tsx",
            "frontend/src/integrations/Mol1Form.tsx",
            "frontend/src/TaskForm.tsx",
            "server_tests/test_prediction_input_preview_browser.py",
            "scripts/prediction-workspace-scope.py",
            ".github/workflows/prediction-workspace-checks.yml",
        }
        for name in changed
    )


CONFIDENCE_PATTERNS = (
    "src/opendde_workbench/confidence.py",
    "tests/test_import_confidence.py",
    "frontend/src/operations/ConfidencePanel*",
    "server_tests/prediction_workspace_case.py",
    "server_tests/native_confidence_case.py",
    "server_tests/test_native_confidence_browser.py",
    "scripts/prediction-workspace-scope.py",
    "tests/test_prediction_workspace_scope.py",
    ".github/workflows/prediction-workspace-checks.yml",
    "docs/frontend-layout.md",
    "docs/quality/frontend-coverage.md",
    "pyproject.toml",
    "uv.lock",
    "frontend/package*.json",
    "install.sh",
    "install.ps1",
)


def native_confidence_only(changed):
    return (
        "src/opendde_workbench/confidence.py" in changed
        and "frontend/src/operations/ConfidencePanel.tsx" in changed
        and all(
            any(fnmatch.fnmatchcase(name, pattern) for pattern in CONFIDENCE_PATTERNS)
            for name in changed
        )
    )


def confidence_changed(changed):
    return any(
        name.startswith("frontend/src/operations/ConfidencePanel")
        or name
        in {
            "src/opendde_workbench/confidence.py",
            "src/opendde_workbench/confidence_binding.py",
            "tests/test_confidence_binding.py",
            "tests/test_import_confidence.py",
            "server_tests/native_confidence_case.py",
            "server_tests/test_native_confidence_browser.py",
        }
        for name in changed
    )


def selected(changed, event="push"):
    if drafts_only(changed, event) or final_review_only(changed, event):
        return True
    if event in {"push", "pull_request"} and native_confidence_only(changed):
        return True
    return (
        event in {"push", "pull_request"}
        and any(
            name.startswith(
                ("frontend/src/presentation/Prediction", "frontend/src/viewer/StructureInspection")
            )
            for name in changed
        )
        and all(any(fnmatch.fnmatchcase(name, pattern) for pattern in PATTERNS) for name in changed)
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
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        for key, value in {
            "docking_review_only": docking_review_only(
                changed, os.environ.get("GITHUB_EVENT_NAME", "push")
            ),
            "drafts_only": drafts_only(changed, os.environ.get("GITHUB_EVENT_NAME", "push")),
            "drafts_changed": drafts_changed(changed, os.environ.get("GITHUB_EVENT_NAME", "push")),
            "final_review_only": final_review_only(
                changed, os.environ.get("GITHUB_EVENT_NAME", "push")
            ),
            "final_review_changed": final_review_changed(
                changed, os.environ.get("GITHUB_EVENT_NAME", "push")
            ),
            "boltz_review_changed": boltz_review_changed(
                changed, os.environ.get("GITHUB_EVENT_NAME", "push")
            ),
            "opendde_review_changed": opendde_review_changed(
                changed, os.environ.get("GITHUB_EVENT_NAME", "push")
            ),
        }.items():
            stream.write(f"{key}={str(value).lower()}\n")
        stream.write(
            "preview_changed="
            + str(preview_changed(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )
        stream.write(
            "input_preview="
            + str(input_preview_only(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )
        stream.write("confidence_changed=" + str(confidence_changed(changed)).lower() + "\n")
        stream.write("native_confidence=" + str(native_confidence_only(changed)).lower() + "\n")
        stream.write(
            "prediction_only="
            + str(selected(changed, os.environ.get("GITHUB_EVENT_NAME", "push"))).lower()
            + "\n"
        )


if __name__ == "__main__":
    main()
