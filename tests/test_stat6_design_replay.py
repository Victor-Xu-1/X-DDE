"""Exact reviewed design recipes are templates, not generic reference presets."""

import json
from uuid import uuid4

import pytest
from test_stat6_prepared_handoff import docking_fixture

from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER


def retained_design(settings, mode, *, reviewed=True):
    store, scientific, records, receptor = docking_fixture(settings)
    capability = "diffsbdd." + mode
    prepared = prepare_stat6(capability, scientific, records=records)
    body = json.loads(json.dumps(prepared.request))
    ref = receptor.reference.model_dump(mode="json")
    body["payload"]["protein"] = ref
    body["payload"]["pocket"] = {
        "kind": "residues",
        "residues": [
            {"structure": ref, "model": 0, "chain": "A", "number": number} for number in (562, 565)
        ],
    }
    body["payload"]["options"].update(
        model="crossdocked_fullatom_cond",
        count=3,
        seed=1901,
        steps=200,
        size_mode="sample",
        fragment_policy="all",
        relaxation=0,
    )
    request = TASK_ADAPTER.validate_python(body)
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    # A lineage/transport fixture, never distributed as native scientific evidence.
    (output / "result.json").write_text('{"controlled_transport_fixture":true}')
    store.bind_environment(job.id, capture(settings, "diffsbdd"))
    store.finish(job.id, Status.SUCCEEDED)
    ExamplePins(store, settings.state_dir, modules=MODULES).pin(
        capability,
        job.id,
        prepared,
        review=ExampleReview(
            interpretation="Controlled task-replay fixture; no scientific inference was run.",
            limitations="This verifies immutable recipe transport, not molecular geometry.",
            checked=(
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ),
        )
        if reviewed
        else None,
    )
    with store.connect() as db:
        authored = json.loads(
            db.execute("SELECT request FROM jobs WHERE id=?", (job.id,)).fetchone()["request"]
        )
    return store, scientific, records, output, authored


@pytest.mark.parametrize("mode", ["generate", "inpaint", "diversify", "optimize"])
def test_design_template_replays_the_exact_reviewed_recipe_without_dispatch(settings, mode):
    store, scientific, records, _, authored = retained_design(settings, mode)
    before = {job.id: job.status for job in store.list_jobs()}
    replay = prepare_stat6("diffsbdd." + mode, scientific, records=records)
    assert replay.request == authored
    assert replay.study["required_materials"] == []
    steps = replay.study["guide"]["steps"]
    assert "AK-1690" not in str(steps)
    assert "saved pocket" in steps[1][1].lower()
    assert "saved sampling" in steps[2][1].lower()
    assert {job.id: job.status for job in store.list_jobs()} == before


def test_changed_design_evidence_never_falls_back_to_a_different_preset(settings):
    _, scientific, records, output, _ = retained_design(settings, "generate")
    (output / "result.json").write_text('{"changed":true}')
    with pytest.raises(ValueError, match="output bytes changed"):
        prepare_stat6("diffsbdd.generate", scientific, records=records)


def test_unreviewed_design_is_not_silently_substituted_for_the_reviewed_recipe(settings):
    _, scientific, records, _, _ = retained_design(settings, "generate", reviewed=False)
    with pytest.raises(ValueError, match="review"):
        prepare_stat6("diffsbdd.generate", scientific, records=records)
