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
