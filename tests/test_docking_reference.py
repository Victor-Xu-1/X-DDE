"""Typed reference comparisons cannot manufacture alignment or scientific acceptance."""

from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.docking.manifest import BINARY_SHA256, VERSION
from opendde_workbench.docking.result import DockingResult


def body():
    receptor = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    ligand = {"asset_id": str(uuid4()), "sha256": "b" * 64}
    return {
        "operation": "docking",
        "complete": True,
        "mode": "score",
        "method": "GNINA",
        "software_version": VERSION,
        "binary_sha256": BINARY_SHA256,
        "parser": "RDKit 2023.09.6",
        "receptor": receptor,
        "ligand": ligand,
        "frame": receptor,
        "options": {},
        "search": None,
        "initial_conformer_generated": False,
        "poses": [
            {
                "record": 0,
                "valid": True,
                "artifact": "pose-001.sdf",
                "qualified_record": 0,
                "smiles": "CCCCN",
                "mapping_status": "native_atom_maps",
                "source_to_pose_atoms": list(range(5)),
                "scores": [
                    {
                        "name": "minimizedAffinity",
                        "value": -5,
                        "unit": "kcal/mol",
                        "direction": "lower",
                    }
                ],
                "reference_rmsd": {"all_heavy": 1, "contact": 0.5},
            }
        ],
        "pose_artifact": "qualified-poses.sdf",
        "raw_pose_artifact": "poses.sdf",
        "receptor_artifact": "receptor.pdb",
        "scientific_outcome": "candidates",
        "scientific_acceptance": "pending_server_validation",
        "coordinate_provenance": "user_confirmed",
        "notes": "Geometry is not binding validation.",
        "reference_comparison": {
            "reference": ligand,
            "role": "input_pose",
            "status": "ready",
            "method": "symmetry_aware_heavy_atom_no_fit",
            "unit": "angstrom",
            "heavy_atom_count": 5,
            "contact_atom_count": 3,
            "contact_cutoff_angstrom": 4,
            "symmetry_mappings": 1,
        },
    }


def test_reference_distances_preserve_native_status_and_legacy_results():
    value = body()
    original = deepcopy(value)
    result = DockingResult.model_validate(value)
    assert result.poses[0].reference_rmsd.all_heavy == 1
    assert result.model_dump(mode="json")["poses"][0]["reference_rmsd"] == {
        "all_heavy": 1,
        "contact": 0.5,
    }
    assert result.scientific_acceptance == "pending_server_validation"
    legacy = deepcopy(value)
    del legacy["reference_comparison"]
    del legacy["poses"][0]["reference_rmsd"]
    old = DockingResult.model_validate(legacy)
    assert old.reference_comparison is None
    serialized = old.model_dump(mode="json")
    assert "receptor_refinement" not in serialized
    assert "reference_comparison" not in serialized
    assert "reference_rmsd" not in serialized["poses"][0]
    assert value == original


@pytest.mark.parametrize(
    "mutate",
    [
        lambda v: v["reference_comparison"].update(reference=v["receptor"]),
        lambda v: v["reference_comparison"].update(role="search_reference"),
        lambda v: v["reference_comparison"].update(contact_atom_count=6),
        lambda v: v["reference_comparison"].update(symmetry_mappings=4097),
        lambda v: v["reference_comparison"].update(method="aligned_rmsd"),
        lambda v: v["reference_comparison"].update(unit="kcal/mol"),
        lambda v: v["poses"][0]["reference_rmsd"].update(all_heavy=float("nan")),
        lambda v: v["poses"][0]["reference_rmsd"].update(contact=None),
        lambda v: v["poses"][0].update(reference_rmsd=None),
        lambda v: v.update(reference_comparison=None),
    ],
)
def test_incompatible_or_fabricated_reference_measurements_are_rejected(mutate):
    value = body()
    mutate(value)
    with pytest.raises(ValidationError):
        DockingResult.model_validate(value)


def test_missing_reference_contacts_are_missing_not_zero_and_no_partial_mapping_is_used():
    value = body()
    value["reference_comparison"]["contact_atom_count"] = 0
    value["poses"][0]["reference_rmsd"]["contact"] = None
    assert DockingResult.model_validate(value).poses[0].reference_rmsd.contact is None
    for status in ("different_chemical_state", "symmetry_limit"):
        if status == "different_chemical_state":
            other = {"asset_id": str(uuid4()), "sha256": "c" * 64}
            value["mode"] = "dock"
            value["search"] = {
                "kind": "reference_ligand",
                "frame": value["receptor"],
                "reference": other,
                "coordinate_basis": "user_confirmed",
            }
            value["reference_comparison"].update(reference=other, role="search_reference")
        value["reference_comparison"].update(
            status=status, contact_atom_count=None, symmetry_mappings=None
        )
        value["poses"][0]["reference_rmsd"] = None
        assert DockingResult.model_validate(value).reference_comparison.status == status
        value["poses"][0]["reference_rmsd"] = {"all_heavy": 0, "contact": None}
        with pytest.raises(ValidationError):
            DockingResult.model_validate(value)


def test_reference_search_requires_the_exact_reference_and_box_search_cannot_claim_it():
    value = body()
    value["mode"] = "dock"
    value["search"] = {
        "kind": "reference_ligand",
        "frame": value["receptor"],
        "reference": value["ligand"],
        "coordinate_basis": "user_confirmed",
    }
    value["reference_comparison"]["role"] = "search_reference"
    assert DockingResult.model_validate(value).reference_comparison.role == "search_reference"
    value["search"] = {
        "kind": "box",
        "frame": value["receptor"],
        "box": {"center": [0, 0, 0], "size": [20, 20, 20]},
    }
    with pytest.raises(ValidationError, match="declared search reference"):
        DockingResult.model_validate(value)
