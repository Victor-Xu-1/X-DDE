"""Exact native-copy case handoff with real stores; transport fixtures, no inference."""

import json
from uuid import uuid4

import pytest
from test_example_supporting import output_object, study
from test_receptor_copy_provenance import receptor_copy
from test_stat6_prepared_handoff import docking_fixture

from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.examples.receptor_provenance import approved_native_receptor_aliases
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.examples.supporting import supporting_evidence
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.quality.contract import PoseQualityTask
from opendde_workbench.research.contracts import VersionInput


def request_for(native, ligand, kind):
    if kind == "quality":
        return PoseQualityTask(
            name="Controlled native-copy handoff",
            molecule=ligand,
            protein=native.reference,
            coordinate_basis="user_confirmed",
            options={"profile": "dock", "cpu": 1, "memory_mib": 2048},
        )
    return DockingTask(
        name="Controlled native-copy handoff",
        receptor=native.reference,
        ligand=ligand,
        search={
            "kind": "box",
            "frame": native.reference,
            "box": {"center": [0, 0, 0], "size": [10, 10, 10]},
        },
    )


@pytest.mark.parametrize("kind", ["dock", "quality"])
def test_followup_uses_the_exact_generated_ligand_and_verified_receptor_copy(settings, kind):
    store, assets, scientific, prepared, primary, _, _, _, _ = study(settings)
    _, _, _, native = docking_fixture(settings)
    copied = receptor_copy(store, scientific, settings, native)
    ligand = output_object(assets, scientific, primary).reference
    request = request_for(copied, ligand, kind)
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    store.bind_environment(job.id, capture(settings, "gnina" if kind == "dock" else "posebusters"))
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "result.json").write_text(json.dumps({"transport_fixture_not_inference": True}))
    store.finish(job.id, Status.SUCCEEDED)
    # A successful foreign calculation alone cannot authorize another case's receptor.
    with pytest.raises(ValueError, match="same reviewed case lineage"):
        supporting_evidence(store, settings.state_dir, primary, prepared, [job.id])
    control = prepared.model_copy(
        update={"objects": {**prepared.objects, "experimental_receptor_control": native}}
    )
    before = {v.id: scientific.get(v.id).model_dump_json() for v in (native, copied)}
    evidence = supporting_evidence(store, settings.state_dir, primary, control, [job.id])
    assert [str(row.job_id) for row in evidence] == [job.id]
    assert {
        identifier: scientific.get(identifier).model_dump_json() for identifier in before
    } == before
    # An unrelated ligand still cannot be laundered through a legitimate receptor alias.
    unrelated = scientific.create(
        VersionInput(asset_id=ligand.asset_id, kind="molecule", label="Unproved same-byte input"),
        uuid4(),
    )
    bad = request_for(copied, unrelated.reference, kind)
    other = store.create(bad, str(uuid4()), 20, 500)
    store.claim(other.id)
    store.bind_environment(
        other.id, capture(settings, "gnina" if kind == "dock" else "posebusters")
    )
    folder = settings.state_dir / "jobs" / other.id / "output"
    folder.mkdir(parents=True)
    (folder / "result.json").write_text('{"transport_fixture_not_inference":true}')
    store.finish(other.id, Status.SUCCEEDED)
    with pytest.raises(ValueError, match="same reviewed case lineage"):
        supporting_evidence(store, settings.state_dir, primary, control, [other.id])


@pytest.mark.parametrize(
    "invalid",
    ["changed_bytes", "wrong_parent", "missing_output", "unproved_upload", "missing_version"],
)
def test_same_byte_or_modified_receptors_do_not_become_native_case_aliases(settings, invalid):
    store, scientific, _, native = docking_fixture(settings)
    if invalid == "unproved_upload":
        # Give the unproved file a distinct upload identity, despite matching content.
        raw = scientific.assets.path(scientific.assets.get(native.reference.asset_id)).read_bytes()
        asset = scientific.assets.save("unproved-copy.pdb", "structure", raw)
        copied = scientific.create(
            VersionInput(asset_id=asset.id, kind="structure", label="Unproved copy"), uuid4()
        )
    else:
        copied = receptor_copy(store, scientific, settings, native, invalid=invalid)
        if invalid == "missing_version":
            copied = copied.model_copy(
                update={"reference": copied.reference.model_copy(update={"version_id": uuid4()})}
            )
    source = next(
        job.request.ligand for job in store.list_jobs() if isinstance(job.request, DockingTask)
    )
    task = request_for(copied, source, "quality")
    with pytest.raises(ValueError):
        approved_native_receptor_aliases(
            scientific, settings.state_dir, task, {str(native.reference.asset_id)}
        )


def test_rgroup_control_keeps_the_original_task_and_does_not_invent_a_receptor(settings):
    store, scientific, records, native = docking_fixture(settings)
    before = len(store.list_jobs())
    cold = prepare_stat6("reinvent.design", scientific)
    assert "experimental_receptor_control" not in cold.objects
    ready = prepare_stat6("reinvent.design", scientific, records=records)
    assert ready.objects["experimental_receptor_control"] == native
    assert ready.request == cold.request
    assert len(store.list_jobs()) == before
