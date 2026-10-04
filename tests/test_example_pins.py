"""Fixed pointer/integrity boundaries using the actual SQLite authorities."""

import hashlib
import json
from uuid import UUID, uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.catalogue import CASES, MODULES
from opendde_workbench.examples.contracts import PreparedExample
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import Properties
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import ConflictError, Store


def fixture(settings):
    state = settings.state_dir
    state.mkdir()
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    scientific = ScientificStore(store, assets)
    asset = assets.save("boundary.sdf", "ligand", b"Controlled protocol bytes\n$$$$\n")
    source = scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Boundary input"), uuid4()
    )
    prepared = PreparedExample(
        module=MODULES["properties"],
        case=CASES["abl-inhibitors"],
        objects={"source": source},
        sequences={},
        sources=(),
    )
    request = Properties(
        name="protocol boundary", ligand_files=[asset.id], scientific_inputs=[source.reference]
    )
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    # Protocol fixtures are never used as published scientific cases.
    (output / "result.json").write_text(json.dumps({"protocol_fixture": True}))
    store.bind_environment(job.id, capture(settings, "opendde"))
    pins = ExamplePins(store, state)
    return store, assets, prepared, job, output, pins


def test_only_successful_jobs_can_be_fixed_and_the_pin_is_idempotent(settings):
    store, _, prepared, job, _, pins = fixture(settings)
    with pytest.raises(ValueError, match="successful"):
        pins.pin("properties", job.id, prepared)
    store.finish(job.id, Status.SUCCEEDED)
    first = pins.pin("properties", job.id, prepared)
    assert pins.pin("properties", job.id, prepared) == first
    assert pins.get("properties", verify=True) == first
    second = store.create(job.request, str(uuid4()), 20, 500)
    store.claim(second.id)
    store.finish(second.id, Status.SUCCEEDED)
    store.bind_environment(second.id, capture(settings, "opendde"))
    second_output = settings.state_dir / "jobs" / second.id / "output"
    second_output.mkdir(parents=True)
    (second_output / "result.json").write_text(json.dumps({"protocol_fixture": True}))
    with pytest.raises(ConflictError, match="immutable"):
        pins.pin("properties", second.id, prepared)


def test_output_corruption_cannot_be_presented_as_a_fixed_result(settings):
    store, _, prepared, job, output, pins = fixture(settings)
    store.finish(job.id, Status.SUCCEEDED)
    pins.pin("properties", job.id, prepared)
    (output / "result.json").write_text('{"changed":true}')
    with pytest.raises(ValueError, match="output bytes changed"):
        pins.get("properties", verify=True)


def test_an_unrelated_input_cannot_be_hidden_beside_a_matching_case_input(settings):
    store, assets, prepared, job, _, pins = fixture(settings)
    unrelated = assets.save("unrelated.sdf", "ligand", b"Unrelated input bytes\n$$$$\n")
    request = job.request.model_copy(
        update={"ligand_files": [*job.request.ligand_files, UUID(unrelated.id)]}
    )
    other = store.create(request, str(uuid4()), 20, 500)
    store.claim(other.id)
    store.finish(other.id, Status.SUCCEEDED)
    with pytest.raises(ValueError, match="Every task input"):
        pins.pin("properties", other.id, prepared)


def test_future_default_fields_do_not_rewrite_the_original_task_evidence(settings):
    from opendde_workbench.chemistry.screen_contract import LibraryScreenTask
    from opendde_workbench.examples.evidence import capture_job, verify_job

    store, assets, _, _, _, _ = fixture(settings)
    asset = assets.save("library.sdf", "ligand", b"Controlled protocol record\n$$$$\n")
    request = LibraryScreenTask(library={"asset_id": asset.id, "sha256": asset.sha256})
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    store.finish(job.id, Status.SUCCEEDED)
    store.bind_environment(job.id, capture(settings, "chemistry"))
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "result.json").write_text('{"protocol_fixture":true}')
    body = json.loads(request.model_dump_json())
    for field in ("alert_policy", "alert_catalogue", "per_scaffold"):
        del body["options"][field]
    original = json.dumps(body, separators=(",", ":"))
    with store.connect() as db:
        db.execute("UPDATE jobs SET request=? WHERE id=?", (original, job.id))
    assert store.get(job.id).request.model_dump_json() != original
    evidence = capture_job(store, settings.state_dir, job.id)
    assert evidence.request_sha256 == hashlib.sha256(original.encode()).hexdigest()
    verify_job(store, settings.state_dir, evidence)
    with store.connect() as db:
        db.execute("UPDATE jobs SET request=? WHERE id=?", (original + " ", job.id))
    with pytest.raises(ValueError, match="output bytes changed"):
        verify_job(store, settings.state_dir, evidence)
