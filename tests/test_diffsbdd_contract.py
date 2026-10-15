"""Scientific contracts reject stale identities and unsupported native combinations."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.diffsbdd.contract import DiffTask
from opendde_workbench.diffsbdd.manifest import MODELS
from opendde_workbench.diffsbdd.options import DiffOptions
from opendde_workbench.diffsbdd.parameter_policy import editable_parameters
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


@pytest.mark.parametrize("model", MODELS)
def test_parameter_visibility_matches_the_pinned_native_sampling_strategy(model):
    options = DiffOptions(model=model)
    fields = editable_parameters(options)
    assert {"steps", "count", "atoms"} <= fields
    assert ("resamplings" in fields) == model.endswith("_joint")
    assert ("jump_length" in fields) == model.endswith("_joint")
    assert "fixed_atoms" not in fields and "task" not in fields
    assert editable_parameters(options.model_copy(update={"size_mode": "sample"})) - fields == {
        "size_bias",
        "minimum_atoms",
    }
    assert "atoms" not in editable_parameters(options.model_copy(update={"size_mode": "sample"}))
    if model.endswith("_cond"):
        local = DiffOptions(task="inpaint", model=model, fixed_atoms=[0], fragment_policy="all")
        assert {"resamplings", "added_atoms", "preserve_bonds", "center"} <= editable_parameters(
            local
        )
        assert not {"jump_length", "atoms", "fixed_atoms"} & editable_parameters(local)
        for task in ("diversify", "optimize"):
            fields = editable_parameters(DiffOptions(task=task, model=model))
            assert "change_steps" in fields
            assert not {"steps", "atoms", "resamplings", "jump_length", "size_mode"} & fields
            assert ("count" in fields) == (task == "diversify")


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


@pytest.mark.parametrize(
    "fixed,added,allowed",
    [(1, 6, False), (1, 7, True), (71, 9, True), (71, 10, False), (80, 0, True)],
)
def test_inpaint_size_is_checked_at_admission_without_breaking_history(fixed, added, allowed):
    from opendde_workbench.diffsbdd.runtime import validate

    body = design("inpaint")
    payload = body["payload"]
    payload["options"].update(fixed_atoms=list(range(fixed)), added_atoms=added)
    payload["fixed_atoms"] = [{"molecule": payload["initial"], "index": i} for i in range(fixed)]
    request = TASK_ADAPTER.validate_python(body)
    state = {"ready": True, "models": {request.payload.options.model: True}}
    if allowed:
        validate(request, state)
    else:
        with pytest.raises(ValueError, match="total 8–80"):
            validate(request, state)
    # Failed historical requests remain readable; native sample mode does not use added_atoms.
    assert TASK_ADAPTER.validate_json(request.model_dump_json()) == request
    payload["options"]["size_mode"] = "sample"
    validate(TASK_ADAPTER.validate_python(body), state)
