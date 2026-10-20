"""Portable shared-file lineage witnesses; controlled protocol files, no inference."""

import json
from dataclasses import replace
from uuid import uuid4

import pytest
from test_example_supporting import complete, study

from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.examples.bundle_archive import read_archive
from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.requests import Properties
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.output_identity import artifact_key
from opendde_workbench.research.outputs import OutputCatalog
from opendde_workbench.store import Store


def indexed_output(settings, store, assets, job, name, content):
    path = settings.state_dir / "jobs" / job.id / "output" / name
    path.write_bytes(content)
    _, objects = OutputCatalog(store, assets).preserve(job.id, path, "ligand")
    assert len(objects) == 1
    return objects[0]


def shared_file_study(settings):
    store, assets, scientific, prepared, primary, _, _, pins, review = study(settings)
    older = complete(settings, store, primary.request)
    shared_bytes = b"Shared controlled output fixture\n$$$$\n"
    old = indexed_output(settings, store, assets, older, "shared.sdf", shared_bytes)
    witness = indexed_output(settings, store, assets, primary, "shared.sdf", shared_bytes)
    selected = indexed_output(
        settings, store, assets, primary, "selected.sdf", b"Selected controlled fixture\n$$$$\n"
    )
    followup = complete(
        settings,
        store,
        Properties(
            name="Exact selected output with a shared-file context version",
            ligand_files=[selected.reference.asset_id, old.reference.asset_id],
            scientific_inputs=[selected.reference, old.reference],
        ),
    )
    assert old.reference.asset_id == witness.reference.asset_id and old.id != witness.id
    assert witness.validation == "file_integrity_only"
    return store, assets, scientific, prepared, primary, older, followup, witness, pins, review


def test_shared_file_witness_roundtrips_without_annotations_or_unrelated_versions(
    settings, tmp_path
):
    store, assets, scientific, prepared, primary, older, followup, witness, pins, review = (
        shared_file_study(settings)
    )
    private = scientific.create(
        VersionInput(
            asset_id=witness.reference.asset_id, kind="molecule", label="Private annotation"
        ),
        uuid4(),
        source_job=primary.id,
    )
    unused = indexed_output(
        settings, store, assets, primary, "unused.sdf", b"Unconsumed controlled fixture\n$$$$\n"
    )
    unrelated = complete(settings, store, primary.request)
    pin = pins.pin(
        "properties", primary.id, prepared, review=review, supporting_job_ids=[followup.id]
    )
    original = witness.model_dump_json()
    path = tmp_path / "shared-output-witness.zip"
    receipt = export_bundle(settings, path, "a" * 40, capabilities=["properties"], profile="stat6")
    manifest = read_archive(path, tmp_path / "inspect", receipt["sha256"])
    objects = {row["id"]: row for row in manifest["records"]["scientific_objects"]}
    assert str(witness.id) in objects
    assert str(private.id) not in objects and str(unused.id) not in objects
    assert json.loads(objects[str(witness.id)]["body"])["validation"] == "file_integrity_only"
    assert {row["id"] for row in manifest["records"]["jobs"]} == {primary.id, older.id, followup.id}
    assert unrelated.id not in json.dumps(manifest)
    assert scientific.get(witness.id).model_dump_json() == original
    restored_settings = replace(settings, state_dir=tmp_path / "restored")
    first = restore_bundle(path, restored_settings, receipt["sha256"])
    second = restore_bundle(path, restored_settings, receipt["sha256"])
    assert first == second == verify_examples(restored_settings, ["properties"], profile="stat6")
    restored = Store(restored_settings.state_dir / "jobs.sqlite3")
    recovered = ExamplePins(
        restored, restored_settings.state_dir, modules=bundle_catalogue("stat6").modules
    )
    assert recovered.get("properties", verify=True) == pin
    assert not ExampleLibrary(restored).personal_jobs(100, 0)


@pytest.mark.parametrize("same_bytes", [False, True])
def test_canonical_registration_key_cannot_claim_an_unreturned_artifact(
    settings, tmp_path, same_bytes
):
    store, assets, scientific, prepared, primary, older, followup, witness, pins, review = (
        shared_file_study(settings)
    )
    content = (
        assets.path(assets.get(witness.reference.asset_id)).read_bytes()
        if same_bytes
        else b"Unreturned fixture\n$$$$\n"
    )
    asset = assets.save("unreturned.sdf", "ligand", content)
    scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Unreturned fixture"),
        artifact_key(primary.id, asset.id, asset.kind, 0),
        source_job=primary.id,
    )
    historical = scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Controlled invalid prior version"),
        uuid4(),
        source_job=older.id,
    )
    # The existing in-memory admission sees the same asset-level registration.
    # Export must additionally prove that the indexed file was really retained.
    bad = complete(
        settings,
        store,
        Properties(
            name="Reject an unreturned historical artifact",
            ligand_files=[*followup.request.ligand_files, historical.reference.asset_id],
            scientific_inputs=[*followup.request.scientific_inputs, historical.reference],
        ),
    )
    pins.pin("properties", primary.id, prepared, review=review, supporting_job_ids=[bad.id])
    target = tmp_path / "not-published.zip"
    with pytest.raises(ValueError, match="not a retained native artifact"):
        export_bundle(settings, target, "a" * 40, capabilities=["properties"], profile="stat6")
    assert not target.exists()


def test_unversioned_file_retains_exact_native_origin_from_selected_input(settings, tmp_path):
    store, assets, scientific, prepared, producer, _, _, pins, review = study(settings)
    parent = prepared.objects["ligand"]
    path = settings.state_dir / "jobs" / producer.id / "output" / "native-source.sdf"
    path.write_bytes(b"Native source protocol fixture\n$$$$\n")
    asset = assets.save(path.name, "ligand", path.read_bytes())
    native = scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label=path.name, parent_id=parent.id),
        artifact_key(producer.id, asset.id, "ligand", 0),
        source_job=producer.id,
    )
    private = scientific.create(
        VersionInput(
            asset_id=asset.id, kind="molecule", label="Private annotation", parent_id=parent.id
        ),
        uuid4(),
        source_job=producer.id,
    )
    consumer = complete(
        settings,
        store,
        Properties(
            name="Explicit file input without a saved version selector",
            ligand_files=[asset.id],
            scientific_inputs=[native.reference.model_copy(update={"version_id": None})],
        ),
    )
    pin = pins.pin("properties", consumer.id, prepared, review=review)
    archive = tmp_path / "native-file-source.zip"
    exported = export_bundle(
        settings, archive, "a" * 40, capabilities=["properties"], profile="stat6"
    )
    manifest = read_archive(archive, tmp_path / "inspect-origin", exported["sha256"])
    objects = {row["id"] for row in manifest["records"]["scientific_objects"]}
    assert str(native.id) in objects and str(private.id) not in objects
    assert {row["id"] for row in manifest["records"]["jobs"]} == {producer.id, consumer.id}
    destination = replace(settings, state_dir=tmp_path / "restored-native-origin")
    assert restore_bundle(archive, destination, exported["sha256"])["computed"] == 1
    restored = Store(destination.state_dir / "jobs.sqlite3")
    assert (
        ExamplePins(restored, destination.state_dir, modules=bundle_catalogue("stat6").modules).get(
            "properties", verify=True
        )
        == pin
    )
