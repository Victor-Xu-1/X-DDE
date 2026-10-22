"""A narrow model batch must not suppress a real broader or explicitly requested check."""

import runpy
from pathlib import Path

import pytest

selected = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/property-model-scope.py")
)["selected"]
MODEL = "src/opendde_workbench/integrations/property_models.py"


def test_model_context_changes_use_the_exact_model_gate_and_shared_consumers():
    assert selected(
        [
            MODEL,
            "frontend/src/integrations/ScientificResults.tsx",
            "frontend/package.json",
            "tests/test_property_model_context.py",
        ]
    )


@pytest.mark.parametrize(
    "extra",
    [
        "frontend/src/viewer/StructureViewer.tsx",
        "src/opendde_workbench/integrations/native_chemprop.py",
        "frontend/src/sites/DefinedRegionForm.tsx",
    ],
)
def test_wider_scientific_or_view_changes_keep_their_existing_gates(extra):
    assert not selected([MODEL, extra])


@pytest.mark.parametrize("event", ["workflow_dispatch", "schedule"])
def test_an_explicit_full_check_is_not_narrowed(event):
    assert not selected([MODEL], event)


def test_empty_or_version_only_change_is_not_a_model_context_change():
    assert not selected([])
    assert not selected(["pyproject.toml", "frontend/package.json"])
