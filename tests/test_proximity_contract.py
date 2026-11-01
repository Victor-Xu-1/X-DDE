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


@pytest.mark.parametrize("samples", [3, 10, 20, 40])
def test_ensemble_size_round_trips_without_expanding_execution_resources(samples):
    original = task()
    selected = task(samples=samples, attempt_budget=min(60, samples * 4))
    replay = IntegratedTask.model_validate_json(selected.model_dump_json())
    assert replay.payload.samples == samples
    assert replay.payload.attempt_budget <= 60
    assert replay.options == original.options
    assert original.payload.samples == 3
    assert original.payload.attempt_budget == 12


@pytest.mark.parametrize(
    "change",
    [
        {"samples": 39, "attempt_budget": 60},
        {"samples": 41, "attempt_budget": 60},
        {"samples": 40, "attempt_budget": 39},
        {"samples": 40, "attempt_budget": 61},
    ],
)
def test_extended_sampling_retains_discrete_and_finite_attempt_bounds(change):
    with pytest.raises(ValidationError):
        task(**change)


def test_extended_native_search_retains_explicit_complete_and_partial_counts():
    from opendde_workbench.proximity.result_models import TernarySearch

    body = {
        "attempted": 40,
        "requested": 40,
        "attempt_budget": 60,
        "returned": 40,
        "status": "requested_samples",
        "seconds": 42.0,
        "failures": [],
    }
    assert TernarySearch.model_validate(body).returned == 40
    partial = {**body, "attempted": 12, "returned": 10, "status": "time_budget"}
    assert TernarySearch.model_validate(partial).returned == 10
    with pytest.raises(ValidationError):
        TernarySearch.model_validate({**body, "returned": 41})


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


def test_fixed_partner_is_explicit_and_unknown_or_glue_alternatives_are_rejected():
    assert task(anchor_partner="b").payload.anchor_partner == "b"
    for mechanism, value in (("protac", "unknown"), ("molecular_glue", "b")):
        with pytest.raises(ValidationError):
            task(mechanism, anchor_partner=value)


def test_legacy_request_serialization_does_not_gain_a_new_default_field():
    original = task().model_dump_json()
    assert '"anchor_partner"' not in original
    assert IntegratedTask.model_validate_json(original).model_dump_json() == original
    explicit = task(anchor_partner="a").model_dump_json()
    assert '"anchor_partner":"a"' in explicit


def test_legacy_native_search_evidence_keeps_its_original_fields():
    from opendde_workbench.proximity.result_models import TernarySearch

    original = {
        "attempted": 3,
        "requested": 3,
        "attempt_budget": 12,
        "returned": 3,
        "status": "requested_samples",
        "seconds": 4.2,
        "failures": [],
    }
    assert TernarySearch.model_validate(original).model_dump() == original
