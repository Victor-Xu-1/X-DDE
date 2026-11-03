import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "prediction_scope", Path(__file__).parents[1] / "scripts/prediction-workspace-scope.py"
)
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


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
        "src/opendde_workbench/confidence.py",
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
