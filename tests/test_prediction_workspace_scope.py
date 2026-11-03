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
        ]
    )
    assert not scope.selected(changes, "workflow_dispatch")
    assert not scope.selected([])
    assert not scope.selected(["frontend/src/integrations/ScientificResults.tsx"])
    assert not scope.selected(changes + ["src/opendde_workbench/integrations/native_mol1.py"])
    assert not scope.selected(changes + ["frontend/src/datasets/DatasetResults.tsx"])
