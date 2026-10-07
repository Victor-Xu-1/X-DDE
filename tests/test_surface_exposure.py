"""Focused envelope, source identity, budgets and evidence integrity, without inference."""

import copy
import hashlib
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.engine_registry import engine_for
from opendde_workbench.receptors.surface_contract import SurfaceExposureTask
from opendde_workbench.receptors.surface_options import SurfaceOptions
from opendde_workbench.receptors.surface_result import validate_surface
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def task():
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    return SurfaceExposureTask(
        structure=ref,
        scientific_inputs=[ref],
        regions=[{"chain": "A", "number": 1, "resname": "JQ1"}],
    )


def test_surface_exact_source_context_and_single_router():
    value = task()
    assert TASK_ADAPTER.validate_python(value.model_dump()) == value
    assert input_identifiers(value) == {str(value.structure.asset_id)}
    assert engine_for(value.operation).id == "biopython"
    for patch in (
        {"scientific_inputs": []},
        {"structure": value.structure.model_copy(update={"record": 1})},
        {"regions": [value.regions[0], value.regions[0]]},
        {"options": {"context_chains": ["B"]}},
    ):
        with pytest.raises(ValidationError):
            SurfaceExposureTask.model_validate({**value.model_dump(), **patch})


@pytest.mark.parametrize(
    "patch",
    [
        {"sphere_points": 1000000},
        {"probe_radius_angstrom": float("nan")},
        {"probe_radius_angstrom": 0},
        {"context_chains": ["A", "A"]},
        {"cpu": 8},
    ],
)
def test_surface_conditions_are_bounded(patch):
    with pytest.raises(ValidationError):
        SurfaceOptions(**patch)


def fixture_report(value, output):
    address = value.regions[0].model_dump()
    metrics = {"isolated_area": 100.0, "assembly_area": 30.0, "buried_area": 70.0}
    artifacts = {}
    for name in ("context.pdb", "regions.csv", "atoms.csv"):
        raw = (name + " retained evidence").encode()
        (output / name).write_bytes(raw)
        artifacts[name] = hashlib.sha256(raw).hexdigest()
    return {
        "operation": "surface_exposure",
        "complete": True,
        "schema_version": 1,
        "source": value.structure.model_dump(mode="json"),
        "regions": [address],
        "options": value.options.model_dump(mode="json"),
        "inspection": {
            "source_format": "pdb",
            "source_model_count": 1,
            "selected_model_index": 0,
            "selected_chains": ["A"],
            "parser_warnings": [],
            "parser_warnings_truncated": False,
        },
        "removed": {"water_residues": 0, "hydrogen_atoms": 0},
        "context_atoms": 3,
        "target_atoms": 1,
        "residues": [{**address, **metrics, "atom_count": 1}],
        "atoms": [{**address, **metrics, "atom": "C1", "element": "C"}],
        **metrics,
        "artifacts": artifacts,
        "preview_artifact": "context.pdb",
        "area_unit": "angstrom_squared",
        "coordinate_frame": "source_coordinates_selected_model",
        "method": "Biopython Shrake-Rupley",
        "radii_angstrom": {"C": 1.7},
        "atom_policy": "observed_heavy_atoms_without_water",
        "biological_assembly": "provided_coordinates_only",
        "scope": "surface_accessibility_not_energy_affinity_or_linker_passage",
        "versions": {"biopython": "1.88"},
    }


def test_surface_evidence_rejects_changed_sources_areas_units_and_downloads(tmp_path):
    selected = task()
    report = fixture_report(selected, tmp_path)
    assert validate_surface(report, selected, tmp_path).buried_area == 70
    for change in (
        {"area_unit": "kcal/mol"},
        {"isolated_area": 999},
        {"radii_angstrom": {"C": 2.0}},
        {"regions": [{**report["regions"][0], "number": 2}]},
        {"versions": {"biopython": "unknown"}},
    ):
        with pytest.raises(ValueError):
            validate_surface({**copy.deepcopy(report), **change}, selected, tmp_path)
    changed = copy.deepcopy(report)
    changed["atoms"][0]["buried_area"] = 0
    with pytest.raises(ValueError):
        validate_surface(changed, selected, tmp_path)
    (tmp_path / "atoms.csv").write_text("changed")
    with pytest.raises(ValueError, match="file changed"):
        validate_surface(report, selected, tmp_path)
