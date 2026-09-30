"""Scientific contracts reject stale identities and unsupported native combinations."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.diffsbdd.contract import DiffTask
from opendde_workbench.diffsbdd.manifest import MODELS
from opendde_workbench.diffsbdd.options import DiffOptions
from opendde_workbench.native_arguments import needs_gpu
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def reference():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0, "conformer": 0}


def design(mode="generate"):
    protein, initial = reference(), reference()
    options = {"task": mode}
    fixed = []
    if mode == "inpaint":
        options.update(fixed_atoms=[0, 1], fragment_policy="all")
        fixed = [{"molecule": initial, "index": index} for index in [0, 1]]
    return {
        "operation": "diffsbdd",
        "name": "design",
        "payload": {
            "mode": mode,
            "protein": protein,
            "initial": initial if mode != "generate" else None,
            "pocket": {
                "kind": "residues",
                "residues": [{"structure": protein, "chain": "A", "number": 10}],
            },
            "options": options,
            "fixed_atoms": fixed,
        },
    }


@pytest.mark.parametrize("mode", ["generate", "inpaint", "diversify", "optimize"])
def test_all_design_modes_use_shared_envelope_and_gpu_gate(mode):
    value = TASK_ADAPTER.validate_python(design(mode))
    assert isinstance(value, DiffTask) and needs_gpu(value)
    assert str(value.payload.protein.asset_id) in input_identifiers(value)
    assert TASK_ADAPTER.validate_json(value.model_dump_json()) == value


def test_all_eight_models_and_native_parameter_bounds():
    assert len(MODELS) == 8
    for model in MODELS:
        assert DiffOptions(model=model).model == model
    for overrides in [
        {"atoms": 7},
        {"steps": 501},
        {"count": 101},
        {"task": "optimize", "model": "moad_ca_joint"},
        {"task": "optimize", "population": 10, "rounds": 11},
        {"trajectory": True},
        {"task": "generate", "model": "moad_ca_joint", "steps": 10, "jump_length": 11},
    ]:
        with pytest.raises(ValidationError):
            DiffOptions(**overrides)


def test_stale_fixed_atoms_pocket_and_insertion_codes_are_rejected():
    value = design("inpaint")
    value["payload"]["fixed_atoms"][0]["molecule"] = reference()
    with pytest.raises(ValidationError, match="exact starting"):
        DiffTask.model_validate(value)
    value = design()
    value["payload"]["pocket"]["residues"][0]["structure"] = reference()
    with pytest.raises(ValidationError, match="exact protein"):
        DiffTask.model_validate(value)
    value = design()
    value["payload"]["pocket"]["residues"][0]["insertion_code"] = "A"
    with pytest.raises(ValidationError, match="insertion"):
        DiffTask.model_validate(value)


def test_atom_identity_uses_same_task_queue_and_cpu_only():
    ref = reference()
    task = TASK_ADAPTER.validate_python(
        {
            "operation": "diffsbdd",
            "name": "identity",
            "payload": {"mode": "identity", "molecule": ref},
        }
    )
    assert not needs_gpu(task)
    assert input_identifiers(task) == {ref["asset_id"]}
    assert TASK_ADAPTER.validate_json(task.model_dump_json()) == task
