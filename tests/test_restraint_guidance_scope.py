import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "guidance_scope", Path(__file__).parents[1] / "scripts/restraint-guidance-scope.py"
)
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


def batch():
    return [
        "frontend/src/guided/Questionnaire.tsx",
        "frontend/src/guided/QuestionnaireGuidance.test.tsx",
        "frontend/src/integrations/ScientificForm.tsx",
        "frontend/src/simulations/SimulationForm.tsx",
        ".github/workflows/restraint-guidance-checks.yml",
    ]


def test_exact_instruction_batch_uses_its_direct_consumer_gate():
    assert scope.selected(batch())
    assert scope.selected(batch(), "pull_request")
    assert scope.selected(batch() + ["pyproject.toml", "uv.lock"])
    assert not scope.selected(batch(), "workflow_dispatch")
    assert not scope.selected([])
    assert not scope.selected(batch()[1:])
    assert not scope.selected([name for name in batch() if "test.tsx" not in name])


def test_business_algorithms_other_forms_and_unknown_files_never_delegate():
    for extra in [
        "src/opendde_workbench/simulations/openmm.py",
        "frontend/src/TaskForm.tsx",
        "frontend/src/viewer/scene.ts",
        "frontend/src/simulations/RestraintEditor.tsx",
        "frontend/src/guided/unknown.ts",
    ]:
        assert not scope.selected(batch() + [extra])
