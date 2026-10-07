"""Scoped task boundaries; real model, pose and chemistry acceptance remains in native CI."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.proximity.options import TernaryPayload


def reference():
    return {"asset_id": str(uuid4()), "sha256": "a" * 64, "record": 0}


def task(mechanism="protac", **kwargs):
    payload = TernaryPayload(
        partner_a_chain="A", partner_b_chain="B", mechanism=mechanism, **kwargs
    )
    roles = ["partner_a", "partner_b", "ligand"]
    if mechanism != "molecular_glue" and payload.input_mode == "binary_poses":
        roles += ["arm_a", "arm_b"]
    inputs = [{"role": role, "source": reference()} for role in roles]
    return IntegratedTask(
        operation="ternary_model",
        name="Whole molecular assembly",
        inputs=inputs,
        scientific_inputs=[row["source"] for row in inputs],
        payload=payload,
        options={"device": "cpu", "cpu": 2, "memory_mib": 6144, "seed": 31},
    )


@pytest.mark.parametrize("mechanism", ["protac", "riptac", "proximity", "molecular_glue"])
def test_mechanisms_retain_explicit_partner_roles_and_cpu_contract(mechanism):
    value = task(mechanism)
    assert value.payload.mechanism == mechanism
    assert len(value.inputs) == (3 if mechanism == "molecular_glue" else 5)
    assert value.options.device == "cpu"


@pytest.mark.parametrize(
    "change",
    [
        {"samples": 20, "attempt_budget": 12},
        {"attempt_budget": 13},
        {"wall_seconds": 1801},
        {"arm_a_map": [0, 1, 1]},
        {"arm_a_map": [0, 1, 2], "arm_b_map": [2, 3, 4]},
        {"input_mode": "shared_complex"},
        {
            "input_mode": "shared_complex",
            "binding_region_a": [0, 1, 2],
            "binding_region_b": [2, 3, 4],
        },
    ],
)
def test_impossible_mapping_and_unbounded_work_are_rejected_before_queue(change):
    with pytest.raises(ValidationError):
        task(**change)


def test_shared_complex_keeps_connected_region_validation_native_and_disjoint_indices_explicit():
    value = task(
        input_mode="shared_complex", binding_region_a=[0, 1, 2], binding_region_b=[8, 9, 10]
    )
    assert [item.role for item in value.inputs] == ["partner_a", "partner_b", "ligand"]
    missing = value.model_dump(mode="json")
    missing["inputs"] = missing["inputs"][:-1]
    with pytest.raises(ValidationError):
        IntegratedTask.model_validate(missing)


def test_glue_cannot_silently_receive_protac_arm_assumptions():
    with pytest.raises(ValidationError):
        task("molecular_glue", arm_a_map=[0, 1, 2])


def test_unreviewed_gpu_and_inadequate_memory_are_not_silent_cpu_fallbacks():
    value = task().model_dump(mode="json")
    for change in ({"device": "cuda"}, {"memory_mib": 1024}, {"cpu": 8}):
        invalid = {**value, "options": {**value["options"], **change}}
        with pytest.raises(ValidationError):
            IntegratedTask.model_validate(invalid)
