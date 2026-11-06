import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "prediction_scope", Path(__file__).parents[1] / "scripts/prediction-workspace-scope.py"
)
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


def test_boltz_confidence_reader_and_shared_inspection_have_one_focused_gate():
    changed = [
        "src/opendde_workbench/boltz_confidence.py",
        "src/opendde_workbench/native_arrays.py",
        "src/opendde_workbench/integrations/boltz_result.py",
        "src/opendde_workbench/integrations/result.py",
        "src/opendde_workbench/science_routes.py",
        "src/opendde_workbench/prediction_archive.py",
        "frontend/src/viewer/confidence-mapping.ts",
        "frontend/src/viewer/scene.ts",
        "frontend/src/viewer/style.test.ts",
        "frontend/src/presentation/usePredictionConfidence.ts",
        "frontend/src/integrations/ScientificResults.tsx",
        "server_tests/test_boltz_confidence_format.py",
        ".github/workflows/scientific-upgrade-checks.yml",
    ]
    assert scope.boltz_confidence_only(changed)
    assert scope.native_confidence_only(changed)
    assert scope.confidence_changed(changed)
    assert scope.prediction_only(changed, "push")
    assert scope.prediction_only(changed, "pull_request")
    assert not scope.prediction_only(changed, "workflow_dispatch")
    for name in (
        "src/opendde_workbench/api.py",
        "src/opendde_workbench/integrations/options.py",
        "frontend/src/viewer/frame.ts",
        "frontend/src/App.tsx",
    ):
        assert not scope.boltz_confidence_only(changed + [name])
    assert not scope.boltz_confidence_only(["pyproject.toml"])


def test_closed_confidence_delegation_keeps_mixed_molecular_design_checks_active():
    changed = [
        "frontend/src/integrations/ScientificResults.tsx",
        "frontend/src/operations/ConfidencePlddt.tsx",
        ".github/workflows/molecule-design-review-checks.yml",
    ]
    assert scope.boltz_confidence_only(changed)
    for name in (
        "frontend/src/integrations/ReinventForm.tsx",
        "frontend/src/integrations/ScientificForm.tsx",
        "frontend/src/integrations/ScientificChoices.tsx",
    ):
        assert not scope.boltz_confidence_only(changed + [name])
    workflow = Path(".github/workflows/prediction-workspace-checks.yml").read_text()
    assert "value: ${{ jobs.scope.outputs.boltz_confidence }}" in workflow
    design = Path(".github/workflows/molecule-design-review-checks.yml").read_text()
    assert "uses: ./.github/workflows/prediction-workspace-checks.yml" in design
    assert "needs.prediction-context.outputs.boltz_confidence != 'true'" in design
    assert (
        "(github.event_name == 'workflow_dispatch' || needs.prediction-context.outputs.boltz_confidence != 'true')"
        in design
    )


def test_job_review_layout_delegation_requires_its_unit_and_real_browser_proof():
    test = "frontend/src/presentation/PredictionJobReview.test.tsx"
    browser = "server_tests/test_job_review_layout_browser.py"
    source = "frontend/src/presentation/PredictionJobReview.tsx"
    assert scope.job_review_layout_only([test])
    assert scope.final_review_only([test])
    assert scope.prediction_only([test])
    assert not scope.job_review_layout_only([test], "workflow_dispatch")
    assert not scope.job_review_layout_only([source, test])
    assert not scope.job_review_layout_only([source, browser])
    changes = [source, test, browser, "scripts/job-review-scope.py"]
    assert scope.job_review_layout_only(changes, "pull_request")
    assert scope.final_review_only(changes)
    assert scope.prediction_only(changes)
    assert scope.final_review_changed(changes)
    assert scope.job_review_layout_only(
        changes
        + [
            "frontend/src/presentation/SequenceTrack.tsx",
            "frontend/src/presentation/SequenceTrack.test.tsx",
        ]
    )
    for unrelated in (
        "src/opendde_workbench/backend.py",
        "frontend/src/operations/useTaskSubmit.ts",
        "frontend/src/viewer/scene.ts",
        "frontend/src/App.tsx",
        "src/opendde_workbench/harness_msa.py",
        "tests/fixtures/stat6/antibody_cdr/provenance.json",
    ):
        assert not scope.job_review_layout_only(changes + [unrelated])
    assert not scope.job_review_layout_only(["pyproject.toml"])
    assert not scope.job_review_layout_only([".github/workflows/prediction-workspace-checks.yml"])
    workflow = (
        Path(__file__).parents[1] / ".github/workflows/prediction-workspace-checks.yml"
    ).read_text()
    native = workflow.split("      - name: Shared layout and all four remaining", 1)[1].split(
        "      - name:", 1
    )[0]
    assert "outputs.job_review_layout == 'true'" in native
    for entry in (
        browser,
        "server_tests/test_fold_msa_sources_browser.py",
        "server_tests/test_docking_job_review_browser.py",
        "server_tests/test_ternary_job_review_browser.py::test_ternary_review_uses_real_independent_binary_frames",
    ):
        assert entry in native
    assert 'WB_DOCKING_VISUAL_STATE="$WB_STATE_DIR"' in native
    assert 'WB_TERNARY_VISUAL_STATE="$WB_STATE_DIR"' in native
    assert "server_tests/job_review_scene_case.py" in native
    assert "src/presentation/SequenceTrack.test.tsx" in workflow
    assert (
        '      - "server_tests/job_review_scene_case.py"' in workflow.split("  pull_request:", 1)[0]
    )
    antibody = (
        Path(__file__).parents[1] / ".github/workflows/antibody-cdr-input-checks.yml"
    ).read_text()
    assert "uses: ./.github/workflows/prediction-workspace-checks.yml" in antibody
    assert "needs: [case-scope, prediction-scope]" in antibody
    assert "needs.prediction-scope.outputs.job_review_layout != 'true'" in antibody


def test_boltz_input_delegation_is_closed_to_chain_inputs_and_exact_review():
    files = sorted(scope.BOLTZ_INPUT_FILES)
    assert scope.boltz_inputs_only(["server_tests/test_boltz_input_settings_browser.py"])
    assert scope.boltz_inputs_only(files)
    assert scope.boltz_inputs_only(files, "pull_request")
    assert scope.prediction_only(files)
    assert not scope.boltz_inputs_only(files, "workflow_dispatch")
    assert not scope.boltz_inputs_only([".github/workflows/prediction-workspace-checks.yml"])
    for unrelated in [
        "frontend/src/integrations/ScientificChoices.tsx",
        "frontend/src/integrations/ScientificForm.tsx",
        "frontend/src/presentation/PredictionFeatureDialog.tsx",
        "frontend/src/App.tsx",
        "src/opendde_workbench/integrations/contract.py",
        "src/opendde_workbench/integrations/native_boltz.py",
    ]:
        assert not scope.boltz_inputs_only(files + [unrelated])
    workflow = (
        Path(__file__).parents[1] / ".github/workflows/prediction-workspace-checks.yml"
    ).read_text()
    focused = workflow.split("  boltz-inputs:", 1)[1].split("  computation-settings:", 1)[0]
    assert "src/integrations/BoltzInputs.test.tsx" in focused
    assert "server_tests/test_boltz_final_review_browser.py" in focused
    assert "tests/test_boltz_msa.py" in focused
    assert "outputs/boltz-input-settings/**" in focused
    assert "runner.temp" not in focused.split("    steps:", 1)[0]


def test_computation_settings_delegation_is_closed_to_native_settings_and_consumers():
    files = sorted(scope.COMPUTATION_SETTING_SOURCES) + [
        "frontend/src/integrations/Mol1Form.tsx",
        "frontend/src/integrations/Mol1Form.test.tsx",
        "server_tests/test_prediction_drafts_browser.py",
        "pyproject.toml",
    ]
    assert scope.computation_settings_only(files)
    assert scope.computation_settings_only(files, "pull_request")
    assert scope.prediction_only(files)
    assert not scope.computation_settings_only(files, "workflow_dispatch")
    assert not scope.computation_settings_only(
        [".github/workflows/prediction-workspace-checks.yml"]
    )
    for unrelated in [
        "src/opendde_workbench/integrations/mol1_contract.py",
        "src/opendde_workbench/drafts/models.py",
        "frontend/src/TaskForm.tsx",
        "frontend/src/App.tsx",
        "frontend/src/viewer/StructureViewport.tsx",
        "frontend/src/simulations/SimulationForm.tsx",
    ]:
        assert not scope.computation_settings_only(files + [unrelated])


def test_computation_settings_have_exact_consumers_without_native_scientific_execution():
    root = Path(__file__).parents[1]
    native = (root / ".github/workflows/mol1-restraint-checks.yml").read_text()
    drawing = native.split("  visual-evidence-contract:", 1)[1].split("    runs-on:", 1)[0]
    assert "needs: scope" in drawing
    assert "outputs.computation_settings != 'true'" in drawing
    forces = native.split("      - name: Actual OpenMM forces", 1)[1].split("        run:", 1)[0]
    assert "outputs.computation_settings != 'true'" in forces
    workflow = (root / ".github/workflows/prediction-workspace-checks.yml").read_text()
    focused = workflow.split("  computation-settings:", 1)[1]
    assert "outputs.computation_settings == 'true'" in focused
    assert "outputs/mol1-settings/**" in focused and "outputs/prediction-drafts/**" in focused
    assert "src/integrations/Mol1SeedEditor.test.tsx" in focused
    assert "server_tests/test_mol1_final_review_browser.py" in focused
    assert "runner.temp" not in focused.split("    steps:", 1)[0]


def test_feature_policy_dialog_delegation_is_closed_to_its_two_native_forms():
    files = sorted(scope.FEATURE_SETTING_SOURCES) + [
        "frontend/src/operations/ExpertParameters.tsx",
        "frontend/src/integrations/Mol1FeatureInputs.tsx",
        "frontend/src/TaskForm.tsx",
        "server_tests/test_mol1_final_review_browser.py",
        "pyproject.toml",
    ]
    assert scope.feature_settings_only(files)
    assert scope.feature_settings_only(files, "pull_request")
    assert scope.feature_settings_only(files + [".github/workflows/template-controls-checks.yml"])
    assert scope.prediction_only(files)
    assert not scope.feature_settings_only(files, "workflow_dispatch")
    assert not scope.feature_settings_only([".github/workflows/prediction-workspace-checks.yml"])
    for unrelated in [
        "src/opendde_workbench/integrations/native_mol1.py",
        "frontend/src/App.tsx",
        "frontend/src/admet/AdmetResults.tsx",
        "frontend/src/simulations/SimulationForm.tsx",
        "src/opendde_workbench/form.py",
    ]:
        assert not scope.feature_settings_only(files + [unrelated])


def test_feature_policy_exemption_does_not_skip_public_cases_for_a_mixed_app_change():
    mixed = [
        "frontend/src/presentation/PredictionFeatureDialog.tsx",
        "frontend/src/TaskForm.tsx",
        "frontend/src/App.tsx",
    ]
    assert scope.prediction_only(mixed)
    assert not scope.feature_settings_only(mixed)
    root = Path(__file__).parents[1]
    workflow = (root / ".github/workflows/template-controls-checks.yml").read_text()
    guard = workflow.split("  public-case-controls:", 1)[1].split("    runs-on:", 1)[0]
    assert "outputs.feature_settings != 'true'" in guard
    assert "outputs.prediction_only" not in guard
    evidence = (root / ".github/workflows/prediction-workspace-checks.yml").read_text()
    assert "outputs/prediction-feature-settings/**" in evidence


def test_entity_editing_delegates_only_its_direct_forms_and_never_engines_or_viewers():
    files = [
        "frontend/src/presentation/PredictionEntityEditing.test.tsx",
        "frontend/src/guided/MolecularInputs.tsx",
    ]
    assert scope.entity_inputs_only(files)
    assert scope.entity_inputs_only(files, "pull_request")
    assert scope.prediction_only(files)
    assert scope.entity_inputs_only(files + ["frontend/src/operations/EntityOptions.tsx"])
    assert scope.entity_inputs_only(["frontend/public/fonts/jetbrains-mono/OFL.txt"])
    assert scope.selected(["frontend/public/fonts/jetbrains-mono/JetBrainsMono-Medium.woff2"])
    assert not scope.entity_inputs_only(files, "workflow_dispatch")
    assert not scope.entity_inputs_only([".github/workflows/prediction-workspace-checks.yml"])
    for unrelated in [
        "src/opendde_workbench/integrations/native_mol1.py",
        "src/opendde_workbench/simulations/restraints.py",
        "frontend/src/viewer/StructureInspection.tsx",
        "frontend/src/App.tsx",
        "frontend/src/presentation/PredictionSetup.tsx",
    ]:
        assert not scope.entity_inputs_only(files + [unrelated])


def test_shared_theme_selects_native_confidence_without_hiding_other_consumers():
    changed = ["frontend/src/tokens.css"]
    assert scope.confidence_changed(changed)
    assert scope.sample_export_changed(changed)
    assert not scope.native_confidence_only(changed)
    assert not scope.sample_export_only(changed)
    assert not scope.prediction_only(changed)


def test_final_review_delegation_requires_browser_and_native_form_changes():
    changed = [
        "frontend/src/integrations/Mol1Form.tsx",
        "frontend/src/integrations/Mol1JobReview.tsx",
        "server_tests/test_mol1_final_review_browser.py",
        "frontend/src/guided/Questionnaire.tsx",
    ]
    assert scope.selected(changed, "pull_request")
    assert scope.final_review_only(changed)
    assert scope.final_review_changed(changed)
    assert scope.final_review_changed(["frontend/src/integrations/Mol1JobReview.tsx"])
    assert scope.preview_changed(["frontend/src/presentation/PredictionReviewDialog.tsx"])
    assert not scope.final_review_only(changed, "workflow_dispatch")
    assert not scope.final_review_only(changed[1:])
    assert not scope.final_review_only(changed + ["frontend/src/operations/useTaskSubmit.ts"])
    assert not scope.final_review_only(changed + ["frontend/src/viewer/StructureInspection.tsx"])
    assert not scope.final_review_only(
        changed + ["src/opendde_workbench/simulations/restraints.py"]
    )


def test_boltz_final_review_delegates_only_ui_and_enables_its_shared_consumers():
    files = [
        "frontend/src/integrations/ScientificForm.tsx",
        "frontend/src/integrations/BoltzJobReview.tsx",
        "server_tests/test_boltz_final_review_browser.py",
        "frontend/src/presentation/PredictionJobReview.tsx",
    ]
    assert scope.final_review_only(files)
    assert scope.boltz_review_changed(files)
    assert scope.final_review_changed(files)
    assert not scope.final_review_only(files[1:])
    assert not scope.final_review_only(
        files + ["src/opendde_workbench/integrations/native_boltz.py"]
    )
    assert not scope.final_review_only(files + ["frontend/src/viewer/StructureInspection.tsx"])


def test_unsubmitted_draft_delegation_is_bounded_to_storage_and_its_native_form():
    changed = [
        "frontend/src/presentation/PredictionDraftControls.tsx",
        "src/opendde_workbench/drafts/storage.py",
        "tests/test_prediction_drafts.py",
        "server_tests/test_prediction_drafts_browser.py",
    ]
    assert scope.selected(changed)
    assert scope.drafts_only(changed, "pull_request")
    assert scope.drafts_changed(changed)
    assert scope.drafts_only(changed + [".github/workflows/docking-runtime-checks.yml"])
    assert not scope.drafts_only(changed, "workflow_dispatch")
    assert not scope.drafts_only(changed[:-1])
    for unrelated in [
        "src/opendde_workbench/integrations/native_mol1.py",
        "src/opendde_workbench/docking/native.py",
        "src/opendde_workbench/docking/image.py",
        "frontend/src/App.tsx",
        "frontend/src/integrations/ScientificForm.tsx",
        "frontend/src/TaskForm.tsx",
    ]:
        assert not scope.drafts_only(changed + [unrelated])
    for consumer in [
        "src/opendde_workbench/assets.py",
        "src/opendde_workbench/api.py",
        "frontend/src/integrations/Mol1Settings.tsx",
    ]:
        assert scope.drafts_changed([consumer])
        assert not scope.drafts_only([consumer])


def test_input_preview_delegation_keeps_only_its_direct_consumer_checks():
    changes = [
        "frontend/src/presentation/PredictionSetup.tsx",
        "frontend/src/presentation/PredictionInputPreview.tsx",
        "frontend/src/presentation/PredictionInputPreview.test.tsx",
        "frontend/src/presentation/PredictionEntityPreview.tsx",
        "frontend/src/integrations/ScientificForm.tsx",
        "server_tests/test_prediction_input_preview_browser.py",
    ]
    assert scope.selected(changes)
    assert scope.input_preview_only(changes)
    assert scope.input_preview_only(changes, "pull_request")
    assert not scope.input_preview_only(changes, "workflow_dispatch")
    assert not scope.input_preview_only(changes[1:])
    for unrelated in [
        "frontend/src/viewer/confidence-mapping.ts",
        "frontend/src/presentation/PredictionSamples.tsx",
        "src/opendde_workbench/integrations/native_mol1.py",
        "frontend/src/App.tsx",
        "frontend/src/another-preview.tsx",
    ]:
        assert not scope.input_preview_only(changes + [unrelated])


def test_preview_regressions_are_detected_independently_of_batch_delegation():
    for path in [
        "frontend/src/presentation/PredictionSetup.tsx",
        "frontend/src/presentation/PredictionInputPreview.test.tsx",
        "frontend/src/presentation/prediction-input-preview.css",
        "frontend/src/integrations/ScientificForm.tsx",
        "server_tests/test_prediction_input_preview_browser.py",
    ]:
        assert scope.preview_changed([path])
        assert not scope.input_preview_only([path])
        assert scope.preview_changed([path, "frontend/src/viewer/style.ts"])
    assert scope.preview_changed([], "workflow_dispatch")
    assert not scope.preview_changed([])
    assert not scope.preview_changed(["frontend/src/viewer/confidence-mapping.ts"])


def test_opendde_review_delegates_only_its_form_transport_and_browser_changes():
    changes = [
        "frontend/src/TaskForm.tsx",
        "frontend/src/operations/OpenDdeJobReview.tsx",
        "server_tests/test_opendde_final_review_browser.py",
        "frontend/src/App.tsx",
        "frontend/src/studio/HomeWorkspace.tsx",
        "frontend/src/presentation/PredictionJobReview.tsx",
    ]
    assert scope.final_review_only(changes, "pull_request")
    assert scope.selected(changes)
    assert scope.opendde_review_changed(changes)
    assert scope.final_review_changed(changes)
    assert scope.boltz_review_changed(changes)
    assert not scope.selected(changes + ["src/opendde_workbench/assets.py"])


def test_fold_review_delegates_its_backend_and_native_browser_consumer():
    changes = [
        "frontend/src/operations/FoldJobReview.tsx",
        "frontend/src/presentation/PredictionJobReview.tsx",
        "src/opendde_workbench/fold_review.py",
        "src/opendde_workbench/harness_chains.py",
        "server_tests/test_fold_msa_sources_browser.py",
    ]
    assert scope.final_review_only(changes, "pull_request")
    assert scope.selected(changes)
    assert not scope.selected(changes + ["src/opendde_workbench/assets.py"])


def test_only_bounded_prediction_presentation_is_delegated():
    changes = [
        "frontend/src/presentation/PredictionSetup.tsx",
        "frontend/src/integrations/ScientificResults.tsx",
        "frontend/src/App.tsx",
        "docs/frontend-layout.md",
        "frontend/package.json",
    ]
    assert scope.selected(changes)
    assert scope.selected(changes, "pull_request")
    assert scope.selected(
        changes
        + [
            "frontend/src/studio/PredictionResults.test.tsx",
            "frontend/src/guided/MolecularInputs.test.tsx",
            "server_tests/test_prediction_entry_browser.py",
            "server_tests/test_template_controls_browser.py",
            "server_tests/test_ensemble_results_browser.py",
            "frontend/src/presentation/prediction-heading-focus.ts",
            "frontend/src/presentation/prediction-heading-focus.test.tsx",
            "frontend/src/viewer/ChainControls.tsx",
            "frontend/src/viewer/chain-controls.css",
            "frontend/src/viewer/chain-visibility.ts",
            "frontend/src/viewer/StructureViewport.tsx",
            "frontend/src/viewer/scene.ts",
            "frontend/src/viewer/frame.ts",
            "frontend/src/viewer/style.test.ts",
        ]
    )
    assert not scope.selected(changes, "workflow_dispatch")
    assert not scope.selected([])
    assert not scope.selected(["frontend/src/integrations/ScientificResults.tsx"])
    assert not scope.selected(changes + ["src/opendde_workbench/integrations/native_mol1.py"])
    assert not scope.selected(changes + ["frontend/src/datasets/DatasetResults.tsx"])
    assert not scope.selected(changes + ["frontend/src/viewer/PoseSession.tsx"])


def test_shared_inspection_has_exact_native_view_checks_without_global_task_suites():
    changes = [
        "frontend/src/viewer/StructureInspection.tsx",
        "frontend/src/viewer/residue-selection.ts",
        "frontend/src/viewer/protocol.ts",
        "frontend/src/viewer/polymer-detail.ts",
        "frontend/src/viewer/style.ts",
        "frontend/src/viewer/StructureViewport.tsx",
        "frontend/src/integrations/ScientificResults.tsx",
        "docs/quality/frontend-coverage.md",
    ]
    assert scope.selected(changes)
    for unrelated in [
        "frontend/src/simulations/SimulationForm.tsx",
        "frontend/src/deployment/ComponentCard.tsx",
        "src/opendde_workbench/models.py",
    ]:
        assert not scope.selected(changes + [unrelated])


def test_native_confidence_units_delegate_only_to_their_real_data_and_view_gate():
    changes = [
        "src/opendde_workbench/confidence.py",
        "frontend/src/operations/ConfidencePanel.tsx",
        "frontend/src/operations/ConfidencePanel.test.tsx",
        "tests/test_import_confidence.py",
        "server_tests/native_confidence_case.py",
        "server_tests/test_native_confidence_browser.py",
        "server_tests/prediction_workspace_case.py",
        ".github/workflows/prediction-workspace-checks.yml",
    ]
    assert scope.native_confidence_only(changes)
    assert scope.confidence_changed(changes)
    assert scope.selected(changes)
    assert scope.selected(changes, "pull_request")
    assert not scope.selected(changes, "workflow_dispatch")
    for unrelated in [
        "src/opendde_workbench/models.py",
        "frontend/src/integrations/Mol1Confidence.tsx",
        "frontend/src/TaskForm.tsx",
    ]:
        assert not scope.native_confidence_only(changes + [unrelated])
        assert not scope.selected(changes + [unrelated])
        assert scope.confidence_changed(changes + [unrelated])
    assert not scope.confidence_changed(["frontend/src/presentation/PredictionSetup.tsx"])


def test_linked_confidence_always_keeps_native_contract_and_render_consumer_checks():
    changes = [
        "frontend/src/viewer/StructureInspection.tsx",
        "frontend/src/viewer/confidence-mapping.ts",
        "frontend/src/viewer/structure-bytes.ts",
        "frontend/src/presentation/plots/InteractivePlot.tsx",
        "src/opendde_workbench/confidence.py",
        "src/opendde_workbench/confidence_binding.py",
        "tests/test_confidence_binding.py",
        "server_tests/test_native_confidence_browser.py",
    ]
    assert scope.selected(changes)
    assert scope.confidence_changed(changes)
    assert not scope.native_confidence_only(changes)
    assert not scope.selected(changes + ["src/opendde_workbench/backend.py"])


def test_docking_preview_delegates_only_frontend_review_without_native_runs():
    changes = scope.DOCKING_REVIEW_ENTRYPOINTS | {
        "frontend/src/presentation/PredictionJobReview.tsx",
        "frontend/src/docking/SearchRegion.tsx",
        ".github/workflows/docking-runtime-checks.yml",
        "pyproject.toml",
    }
    assert scope.docking_review_only(changes)
    assert scope.final_review_only(changes, "pull_request")
    assert scope.selected(changes)
    assert not scope.docking_review_only(changes, "workflow_dispatch")
    assert not scope.docking_review_only(
        changes - {"server_tests/test_docking_job_review_browser.py"}
    )
    assert not scope.docking_review_only(changes | {"src/opendde_workbench/docking/native.py"})


def test_diffsbdd_spatial_review_delegates_to_real_geometry_and_source_gate():
    changes = scope.SPATIAL_DESIGN_REVIEW_REQUIRED | {
        ".github/workflows/prolif-contact-checks.yml",
        "frontend/src/diffsbdd/DiffForm.tsx",
        "pyproject.toml",
    }
    assert scope.final_review_only(changes)
    assert scope.selected(changes, "pull_request")
    assert not scope.selected(changes - {"server_tests/test_diff_review_browser.py"})
    assert not scope.selected(changes | {"src/opendde_workbench/diffsbdd/runtime.py"})
    assert not scope.selected(changes, "workflow_dispatch")


def test_prediction_export_gate_remains_enabled_with_adjacent_result_changes():
    files = [
        "frontend/src/presentation/PredictionSamples.tsx",
        "src/opendde_workbench/prediction_sample_export.py",
        "src/opendde_workbench/native_runtime/analysis.py",
        "src/opendde_workbench/integrations/native_boltz.py",
    ]
    assert scope.sample_export_only(files)
    assert scope.selected(files)
    mixed = files + ["frontend/src/integrations/ScientificResults.tsx"]
    assert scope.sample_export_changed(mixed)
    assert not scope.sample_export_only(mixed)
    assert not scope.selected(mixed)
    assert not scope.sample_export_changed(["frontend/src/integrations/ScientificResults.tsx"])


def test_prediction_reference_review_keeps_the_retained_geometry_gate_in_mixed_changes():
    paths = [
        "frontend/src/integrations/ScientificResults.tsx",
        "frontend/src/presentation/PredictionReferenceEvidence.ts",
        "server_tests/test_prediction_reference_review_browser.py",
        "frontend/src/viewer/frame.ts",
        "frontend/src/viewer/source-layout.ts",
    ]
    assert scope.reference_review_only(paths)
    assert scope.selected(paths)
    mixed = paths + ["frontend/src/viewer/Scene.ts"]
    assert scope.reference_review_changed(mixed)
    assert not scope.reference_review_only(mixed)


def test_historical_input_selects_its_archive_and_direct_result_consumers():
    paths = [
        "frontend/src/TaskDetail.tsx",
        "frontend/src/presentation/HistoricalPredictionInput.tsx",
        "src/opendde_workbench/api.py",
        "server_tests/test_prediction_history_input_browser.py",
    ]
    assert scope.history_input_only(paths)
    assert scope.selected(paths)
    mixed = paths + ["frontend/src/studio/Header.tsx"]
    assert scope.history_input_changed(mixed)
    assert not scope.history_input_only(mixed)


def test_prediction_job_archive_keeps_selected_model_export_as_direct_regression():
    paths = [
        "src/opendde_workbench/prediction_archive.py",
        "src/opendde_workbench/science_routes.py",
        "frontend/src/presentation/PredictionArchiveDownload.tsx",
        "frontend/src/studio/PredictionResults.tsx",
    ]
    assert scope.job_archive_only(paths)
    assert scope.sample_export_changed(paths)
    assert scope.selected(paths)
    assert not scope.job_archive_only(paths + ["frontend/src/studio/Header.tsx"])


def test_prediction_result_header_routes_to_the_archive_and_history_browser():
    paths = [
        "frontend/src/App.tsx",
        "frontend/src/studio/TaskWorkspace.tsx",
        "frontend/src/TaskDetail.tsx",
        "frontend/src/TaskDetail.test.tsx",
        "frontend/src/presentation/PredictionResultHeader.tsx",
        "frontend/src/presentation/prediction-result-header.css",
        "frontend/src/presentation/prediction-history-input.css",
        "frontend/src/presentation/prediction-workspace.css",
        "server_tests/test_prediction_job_archive_browser.py",
    ]
    assert scope.job_archive_only(paths, "pull_request")
    assert scope.history_input_changed(paths)
    assert scope.selected(paths)
    for name in (
        "frontend/src/presentation/PredictionResultHeader.tsx",
        "frontend/src/presentation/prediction-result-header.css",
    ):
        assert scope.job_archive_changed([name])
        assert scope.job_archive_only([name], "pull_request")
        assert scope.selected([name])


def test_shared_confidence_card_selects_its_exact_native_render_gates():
    paths = [
        "frontend/src/presentation/PredictionConfidenceCard.tsx",
        "frontend/src/presentation/prediction-confidence-card.css",
        "frontend/src/presentation/prediction-results.css",
        "frontend/src/studio/PredictionResults.tsx",
        "frontend/src/integrations/Mol1Confidence.tsx",
        "frontend/src/integrations/ScientificResults.tsx",
        "frontend/src/operations/ConfidencePanel.tsx",
        "server_tests/test_native_confidence_browser.py",
        "server_tests/test_prediction_sample_export_browser.py",
        "pyproject.toml",
    ]
    assert scope.selected(paths, "pull_request")
    assert scope.native_confidence_only(paths)
    assert scope.confidence_changed(paths)
    assert scope.sample_export_changed(paths)
    assert not scope.native_confidence_only(paths + ["frontend/src/TaskForm.tsx"])
    for name in scope.CONFIDENCE_LAYOUT_SOURCES:
        assert scope.native_confidence_only([name])
        assert scope.confidence_changed([name])
        assert scope.sample_export_changed([name])


def test_prediction_sequence_layout_selects_both_retained_result_paths():
    paths = [
        "frontend/src/presentation/StructureWorkbench.tsx",
        "frontend/src/presentation/structure-workbench.css",
        "frontend/src/viewer/StructureViewport.tsx",
        "frontend/src/viewer/StructureInspection.tsx",
        "frontend/src/viewer/StructureInspection.test.tsx",
        "frontend/src/viewer/StructureViewer.test.tsx",
        "frontend/src/viewer/structure-inspection.css",
        "frontend/src/studio/PredictionResults.tsx",
        "frontend/src/integrations/ScientificResults.tsx",
        "server_tests/test_native_confidence_browser.py",
        "server_tests/test_prediction_sample_export_browser.py",
    ]
    assert scope.native_confidence_only(paths)
    assert scope.selected(paths, "pull_request")
    assert not scope.prediction_only(paths, "pull_request")
    assert scope.shared_workbench_only(paths)
    assert scope.shared_workbench_only(paths, "pull_request")
    assert not scope.shared_workbench_only(paths, "workflow_dispatch")
    assert not scope.shared_workbench_only(paths + ["src/opendde_workbench/backend.py"])
    assert scope.confidence_changed(paths)
    assert scope.sample_export_changed(paths)
    for path in paths[:2]:
        assert scope.native_confidence_only([path])
        assert not scope.prediction_only([path])
        assert scope.shared_workbench_only([path])


def test_shared_example_inspection_runs_its_own_browser_checks_for_stacked_candidates():
    changed = [
        "frontend/src/studio/PredictionInspection.tsx",
        "frontend/src/examples/ExampleJobResult.tsx",
        "server_tests/test_prediction_workspace_browser.py",
        "frontend/package.json",
    ]
    assert scope.prediction_only(changed, "pull_request")
    assert scope.prediction_only(changed + sorted(scope.SERVICE_SHUTDOWN_FILES))
    assert not scope.prediction_only(changed, "workflow_dispatch")
    assert not scope.prediction_only(changed + ["src/opendde_workbench/__main__.py"])
    assert not scope.prediction_only(changed + ["frontend/src/App.tsx"])
