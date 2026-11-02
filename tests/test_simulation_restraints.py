"""Source identity, physical bounds and historical request compatibility."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.simulations.options import DynamicsPayload, GromacsDynamicsPayload


def source():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}


def task():
    reference = source()
    atom = {
        "role": "structure",
        "source": reference,
        "chain": "A",
        "number": 8,
        "atom": "CA",
        "position_angstrom": [1, 2, 3],
    }
    return {
        "operation": "molecular_dynamics",
        "name": "Restrained complex",
        "inputs": [{"role": "structure", "source": reference}],
        "scientific_inputs": [reference],
        "payload": {
            "kind": "openmm",
            "mode": "dynamics",
            "restraints": [{"kind": "position", "atom": atom}],
        },
    }


def test_legacy_dynamics_bytes_do_not_gain_empty_optional_conditions():
    assert "restraints" not in DynamicsPayload().model_dump()
    assert "restraints" not in GromacsDynamicsPayload().model_dump()
    value = IntegratedTask.model_validate(task())
    assert value.payload.restraints[0].force_kj_mol_nm2 == 1000


def test_result_cannot_claim_success_without_the_exact_native_force_receipt(tmp_path):
    import json
    from types import SimpleNamespace

    from opendde_workbench.simulations.restraint_result import validate_restraint_result

    value = IntegratedTask.model_validate(task())
    result = SimpleNamespace(artifact_sha256={})
    with pytest.raises(ValueError, match="requested restraint forces"):
        validate_restraint_result(result, value, tmp_path)
    receipt = {
        "method": "OpenMM harmonic positional/distance restraints",
        "scope": "soft_restraints_not_rigid_constraints_or_binding_energy",
        "force_constant_unit": "kJ mol^-1 nm^-2",
        "display_distance_unit": "angstrom",
        "position_reference": "exact_original_input_coordinates",
        "conditions": [
            {
                "condition": value.payload.restraints[0].model_dump(mode="json"),
                "system_atom_indices": [7],
            }
        ],
    }
    file = tmp_path / "restraints.json"
    file.write_text(json.dumps(receipt))
    result.artifact_sha256["restraints.json"] = "a" * 64
    validate_restraint_result(result, value, tmp_path)
    receipt["conditions"][0]["condition"]["force_kj_mol_nm2"] = 100
    file.write_text(json.dumps(receipt))
    with pytest.raises(ValueError, match="exact submitted"):
        validate_restraint_result(result, value, tmp_path)


def test_restraints_cannot_follow_another_material_or_preparation_version():
    value = task()
    value["payload"]["restraints"][0]["atom"]["source"] = source()
    with pytest.raises(ValidationError, match="different input version"):
        IntegratedTask.model_validate(value)


@pytest.mark.parametrize("force", [0, -1, float("nan"), 100001])
def test_invalid_physical_strengths_are_rejected(force):
    value = task()
    value["payload"]["restraints"][0]["force_kj_mol_nm2"] = force
    with pytest.raises(ValidationError):
        IntegratedTask.model_validate(value)


def test_nearby_coordinate_rounding_cannot_duplicate_the_same_atom_restraint():
    value = task()
    atom = dict(value["payload"]["restraints"][0]["atom"], position_angstrom=[1.0001, 2, 3])
    value["payload"]["restraints"].append({"kind": "position", "atom": atom})
    with pytest.raises(ValidationError, match="duplicate or conflicting"):
        IntegratedTask.model_validate(value)


def test_gromacs_rejects_instead_of_ignoring_openmm_only_conditions():
    value = task()
    value["operation"] = "gromacs_dynamics"
    value["payload"]["kind"] = "gromacs"
    with pytest.raises(ValidationError, match="currently require OpenMM"):
        IntegratedTask.model_validate(value)
