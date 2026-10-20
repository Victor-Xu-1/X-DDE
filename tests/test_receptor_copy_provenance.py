"""Real store and native-output integrity fixtures; no scientific inference."""

import json
from uuid import uuid4

import pytest
from test_stat6_prepared_handoff import docking_fixture

from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.receptor_provenance import prepared_receptor_origin
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.contracts import VersionInput


def receptor_copy(store, scientific, settings, previous, *, invalid=None):
    pin = ExamplePins(store, settings.state_dir, modules=MODULES).get("gnina.dock")
    body = store.get(str(pin.job_id)).request.model_dump(mode="json")
    body["receptor"] = previous.reference.model_dump(mode="json")
    body["search"]["frame"] = body["receptor"]
    job = store.create(TASK_ADAPTER.validate_python(body), str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    raw = scientific.assets.path(scientific.assets.get(previous.reference.asset_id)).read_bytes()
    if invalid != "missing_output":
        (output / "receptor.pdb").write_bytes(raw)
    (output / "result.json").write_text(json.dumps({"transport_fixture_not_inference": True}))
    store.bind_environment(job.id, capture(settings, "gnina"))
    store.finish(job.id, Status.SUCCEEDED)
    asset = scientific.assets.save(
        "receptor-copy.pdb", "structure", raw + b"changed" if invalid == "changed_bytes" else raw
    )
    version = scientific.create(
        VersionInput(
            asset_id=asset.id,
            kind="structure",
            label="Native-copy protocol fixture",
            parent_id=previous.parent_id if invalid == "wrong_parent" else previous.id,
            relation="derived_from",
        ),
        uuid4(),
        source_job=job.id,
    )
    return version


def test_multiple_docking_copies_resolve_to_the_unchanged_canonical_preparation(settings):
    store, scientific, _, native = docking_fixture(settings)
    first = receptor_copy(store, scientific, settings, native)
    second = receptor_copy(store, scientific, settings, first)
    before = {
        key: scientific.get(key).model_dump_json() for key in (native.id, first.id, second.id)
    }
    resolved, source = prepared_receptor_origin(scientific, settings.state_dir, second)
    assert resolved == native and source.id == str(native.source_job)
    assert {key: scientific.get(key).model_dump_json() for key in before} == before


@pytest.mark.parametrize("invalid", ["changed_bytes", "wrong_parent", "missing_output"])
def test_unproved_or_modified_copies_do_not_replace_the_reviewed_preparation(settings, invalid):
    store, scientific, _, native = docking_fixture(settings)
    copied = receptor_copy(store, scientific, settings, native, invalid=invalid)
    with pytest.raises(ValueError, match="receptor copy"):
        prepared_receptor_origin(scientific, settings.state_dir, copied)


def test_identical_user_file_is_not_native_preparation_provenance(settings):
    _, scientific, _, native = docking_fixture(settings)
    unrelated = scientific.create(
        VersionInput(asset_id=native.reference.asset_id, kind="structure", label="Unproved copy"),
        uuid4(),
    )
    with pytest.raises(ValueError, match="no successful native"):
        prepared_receptor_origin(scientific, settings.state_dir, unrelated)
