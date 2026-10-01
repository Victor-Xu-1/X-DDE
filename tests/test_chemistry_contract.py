"""Chemistry prerequisites and typed preparation budgets without scientific inference."""

from dataclasses import replace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.chemistry.contract import MolecularStatesTask
from opendde_workbench.chemistry.image import VERSION, labels_match, lock_digest
from opendde_workbench.chemistry.options import StateOptions
from opendde_workbench.chemistry.runtime import configuration, validate
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def test_state_task_is_registered_with_exact_input_and_bounded_combinations():
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 2, "conformer": 0}
    request = TASK_ADAPTER.validate_python({"operation": "molecular_states", "molecule": ref})
    assert isinstance(request, MolecularStatesTask)
    assert engine_for(request.operation).id == "chemistry"
    assert input_identifiers(request) == {ref["asset_id"]}
    assert TASK_ADAPTER.validate_json(request.model_dump_json()) == request
    for fields in [
        {"ph_min": 9, "ph_max": 4},
        {"max_states": 64, "conformers_per_state": 16},
        {"cpu": 0},
        {"memory_mib": 100},
        {"force_field": "fake"},
        {"ph_min": float("nan")},
    ]:
        with pytest.raises(ValidationError):
            StateOptions(**fields)


def test_chemistry_configuration_is_immutable_and_independent_of_opendde(settings):
    with pytest.raises(ValueError, match="Install"):
        configuration(settings)
    image = "sha256:" + "a" * 64
    assert configuration(replace(settings, chemistry_image=image)) == image
    assert labels_match(
        {"org.xdde.chemistry.version": VERSION, "org.xdde.chemistry.runtime-lock": lock_digest()}
    )
    assert not labels_match(
        {"org.xdde.chemistry.version": VERSION, "org.xdde.chemistry.runtime-lock": "changed"}
    )
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "molecular_states",
            "molecule": {"asset_id": str(uuid4()), "sha256": "a" * 64},
        }
    )
    with pytest.raises(RuntimeError, match="unavailable"):
        validate(request, {"ready": False})
    validate(request, {"ready": True})


def test_prepared_result_rejects_inconsistent_mapping_energy_and_per_state_budget():
    from copy import deepcopy

    from opendde_workbench.chemistry.result import MolecularStatesResult

    result = {
        "operation": "molecular_states",
        "complete": True,
        "schema_version": 1,
        "source": {"asset_id": str(uuid4()), "sha256": "a" * 64},
        "options": {"max_states": 1, "conformers_per_state": 1},
        "states": [
            {
                "index": 0,
                "smiles": "CCO",
                "charge": 0,
                "formula": "C2H6O",
                "source_to_state_atoms": [0, 1, 2],
                "conformer_status": "completed",
            }
        ],
        "conformers": [
            {
                "record": 0,
                "state_index": 0,
                "native_conformer": 0,
                "artifact": "conformer-001.sdf",
                "artifact_sha256": "b" * 64,
                "source_to_conformer_atoms": [0, 1, 2],
                "energy": 1.5,
                "converged": True,
            }
        ],
        "coverage": {
            "budget_limited": False,
            "enumeration_work": 1,
            "rejected": 0,
            "population_probabilities": "not_computed",
        },
        "state_artifact": "states.sdf",
        "conformer_artifact": "conformers.sdf",
        "artifact_sha256": {"states.sdf": "c" * 64, "conformers.sdf": "d" * 64},
        "versions": {"rdkit": "2023.09.6", "dimorphite_dl": "2.0.2"},
        "geometry_frame": "unbound_conformer",
        "energy_unit": "kcal/mol",
        "energy_comparison": "same_state_only",
    }
    assert MolecularStatesResult.model_validate(result).conformers[0].energy == 1.5
    for mutation in (
        "short_map",
        "missing_energy",
        "missing_convergence",
        "extra_conformer",
        "wrong_status",
    ):
        bad = deepcopy(result)
        if mutation == "short_map":
            bad["conformers"][0]["source_to_conformer_atoms"] = [0, 1]
        elif mutation == "missing_energy":
            bad["conformers"][0]["energy"] = None
        elif mutation == "missing_convergence":
            bad["conformers"][0]["converged"] = None
        elif mutation == "extra_conformer":
            row = deepcopy(bad["conformers"][0])
            row.update(record=1, artifact="conformer-002.sdf")
            bad["conformers"].append(row)
        else:
            bad["states"][0]["conformer_status"] = "not_requested"
        with pytest.raises(ValidationError):
            MolecularStatesResult.model_validate(bad)
