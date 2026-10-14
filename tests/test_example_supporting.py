"""A reviewed case retains its typed follow-up results without admitting private work."""

import json
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.examples.bundle_archive import read_archive
from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER, Properties
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import ConflictError, Store


def study(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    catalogue = bundle_catalogue("stat6")
    prepared = catalogue.prepare(
        "properties", scientific, settings.state_dir / "public-example-cache", None
    )
    primary = complete(settings, store, TASK_ADAPTER.validate_python(prepared.request))
    first = output_object(assets, scientific, primary)
    followup = complete(
        settings,
        store,
        Properties(ligand_files=[first.reference.asset_id], scientific_inputs=[first.reference]),
    )
    second = output_object(assets, scientific, followup)
    quality = complete(
        settings,
        store,
        Properties(ligand_files=[second.reference.asset_id], scientific_inputs=[second.reference]),
    )
    pins = ExamplePins(store, settings.state_dir, modules=catalogue.modules)
    review = ExampleReview(
        interpretation="Lineage fixture: original output, refinement and quality.",
        limitations="Protocol fixtures verify immutable storage; no scientific inference ran.",
        checked=("input_identity", "method_scope", "native_outputs", "visual_preview", "downloads"),
    )
    return store, assets, scientific, prepared, primary, followup, quality, pins, review


def complete(settings, store, request):
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    store.bind_environment(job.id, capture(settings, "chemistry"))
    path = settings.state_dir / "jobs" / job.id / "output"
    path.mkdir(parents=True)
    (path / "result.json").write_text('{"protocol_fixture":true}')
    store.finish(job.id, Status.SUCCEEDED)
    return store.get(job.id)


def output_object(assets, scientific, job):
    asset = assets.save("protocol-output.sdf", "ligand", b"Protocol fixture\n$$$$\n")
    return scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Computed protocol output"),
        uuid4(),
        source_job=job.id,
    )


def test_dependency_order_and_immutable_followup_bytes(settings):
    store, _, _, prepared, primary, followup, quality, pins, review = study(settings)
    identifiers = [followup.id, quality.id]
    pin = pins.pin(
        "properties", primary.id, prepared, review=review, supporting_job_ids=identifiers
    )
    assert [str(value.job_id) for value in pin.supporting_evidence] == identifiers
    assert pins.get("properties", verify=True) == pin
    assert (
        pins.pin("properties", primary.id, prepared, review=review, supporting_job_ids=identifiers)
        == pin
    )
    with pytest.raises(ConflictError, match="immutable"):
        pins.pin(
            "properties", primary.id, prepared, review=review, supporting_job_ids=[followup.id]
        )
    output = settings.state_dir / "jobs" / quality.id / "output" / "result.json"
    output.write_text('{"changed":true}')
    with pytest.raises(ValueError, match="output bytes changed"):
        pins.get("properties", verify=True)
    assert store.get(primary.id).status == "succeeded"


@pytest.mark.parametrize("selection", ["reverse", "duplicate", "primary", "unrelated", "extra"])
def test_unrelated_or_invalid_followups_cannot_be_admitted(settings, selection):
    store, assets, _, prepared, primary, followup, quality, pins, review = study(settings)
    if selection == "extra":
        private = assets.save("private.sdf", "ligand", b"Private protocol input\n$$$$\n")
        # Use a real unrelated asset, not a missing-file failure.
        request = followup.request.model_copy(
            update={"ligand_files": [*followup.request.ligand_files, UUID(private.id)]}
        )
        bad = complete(settings, store, request)
        identifiers = [bad.id]
    else:
        identifiers = {
            "reverse": [quality.id, followup.id],
            "duplicate": [followup.id, followup.id],
            "primary": [primary.id],
            "unrelated": [complete(settings, store, primary.request).id],
        }[selection]
    with pytest.raises(ValueError, match="unique|dependency order"):
        pins.pin("properties", primary.id, prepared, review=review, supporting_job_ids=identifiers)
    assert pins.get("properties") is None


@pytest.mark.parametrize("status", ["queued", "running", "failed", "cancelled", "interrupted"])
def test_unsuccessful_followup_is_not_a_computed_example(settings, status):
    store, _, _, prepared, primary, followup, _, pins, review = study(settings)
    with store.connect() as db:
        db.execute("UPDATE jobs SET status=? WHERE id=?", (status, followup.id))
    with pytest.raises(ValueError, match="successful native follow-up"):
        pins.pin(
            "properties", primary.id, prepared, review=review, supporting_job_ids=[followup.id]
        )
    assert pins.get("properties") is None


def test_supporting_closure_roundtrips_without_private_jobs_or_recomputation(settings, tmp_path):
    store, _, _, prepared, primary, followup, quality, pins, review = study(settings)
    original = {job.id: job.model_dump() for job in (primary, followup, quality)}
    private = complete(settings, store, primary.request)
    pin = pins.pin(
        "properties",
        primary.id,
        prepared,
        review=review,
        supporting_job_ids=[followup.id, quality.id],
    )
    library = ExampleLibrary(store)
    assert [job.id for job in library.personal_jobs(20, 0)] == [private.id]
    path = tmp_path / "reviewed-followups.zip"
    receipt = export_bundle(settings, path, "a" * 40, capabilities=["properties"], profile="stat6")
    manifest = read_archive(path, tmp_path / "inspect", receipt["sha256"])
    assert {row["id"] for row in manifest["records"]["jobs"]} == set(original)
    assert private.id not in json.dumps(manifest)
    destination = replace(settings, state_dir=tmp_path / "restored")
    restore_bundle(path, destination, receipt["sha256"])
    restore_bundle(path, destination, receipt["sha256"])
    recovered = Store(destination.state_dir / "jobs.sqlite3")
    catalogue = bundle_catalogue("stat6")
    recovered_pins = ExamplePins(recovered, destination.state_dir, modules=catalogue.modules)
    assert recovered_pins.get("properties", verify=True) == pin
    assert not ExampleLibrary(recovered).personal_jobs(20, 0)
    assert {job.id: job.model_dump() for job in recovered.list_jobs()} == original


def test_export_revalidates_followup_lineage_instead_of_trusting_stored_pin_metadata(settings):
    store, _, _, prepared, primary, followup, quality, pins, review = study(settings)
    pin = pins.pin(
        "properties",
        primary.id,
        prepared,
        review=review,
        supporting_job_ids=[followup.id, quality.id],
    )
    changed = pin.model_copy(
        update={"supporting_evidence": tuple(reversed(pin.supporting_evidence))}
    )
    with store.connect() as db:
        db.execute(
            "UPDATE example_pins SET body=? WHERE capability_id=? AND revision=?",
            (changed.model_dump_json(), "properties", prepared.module.revision),
        )
    with pytest.raises(ValueError, match="dependency order"):
        verify_examples(settings, ["properties"], profile="stat6")


def test_api_persists_reviewed_followup_ids_and_keeps_csrf_boundary(settings, client_factory):
    _, _, _, _, primary, followup, quality, _, review = study(settings)
    body = {
        "job_id": primary.id,
        "review": review.model_dump(mode="json"),
        "supporting_job_ids": [followup.id, quality.id],
    }
    with client_factory() as client:
        response = client.post("/api/examples/properties/pin", json=body)
        assert response.status_code == 200, response.text
        assert [e["job_id"] for e in response.json()["supporting_evidence"]] == body[
            "supporting_job_ids"
        ]
        assert client.get("/api/examples/properties").json()["pin"] == response.json()
        client.headers.pop("X-Workbench-CSRF")
        assert client.post("/api/examples/properties/pin", json=body).status_code == 403
