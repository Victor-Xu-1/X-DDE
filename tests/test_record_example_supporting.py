"""Controlled record-lineage fixtures; no scientific inference or repaired case claims."""

import json
from dataclasses import replace
from uuid import uuid4

import pytest
from test_example_records import fixture as region_fixture
from test_example_supporting import complete, output_object

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle import export_bundle, restore_bundle
from opendde_workbench.examples.bundle_catalogue import BundleCatalogue
from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.requests import Properties
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import ConflictError, Store


def study(settings):
    create_app(settings)
    pins, prepared, record, _, _, _ = region_fixture(settings)
    store = pins.store
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    source = store.get(record["body"]["identity_job"])
    original = output_object(assets, scientific, source)
    followup = complete(
        settings,
        store,
        Properties(
            name="First record follow-up",
            ligand_files=[original.reference.asset_id],
            scientific_inputs=[original.reference],
        ),
    )
    next_version = output_object(assets, scientific, followup)
    final = complete(
        settings,
        store,
        Properties(
            ligand_files=[next_version.reference.asset_id],
            name="Second record follow-up",
            scientific_inputs=[next_version.reference],
        ),
    )
    review = ExampleReview(
        interpretation="Protocol record retains original output and reviewed follow-up stages.",
        limitations="Storage and lineage fixture only; no scientific acceptance is claimed.",
        checked=("input_identity", "method_scope", "native_outputs", "visual_preview", "downloads"),
    )
    return pins, prepared, record, source, followup, final, review, original


def test_record_review_and_followups_are_immutable_and_verify_exact_native_bytes(settings):
    pins, prepared, record, _, followup, final, review, _ = study(settings)
    options = dict(review=review, supporting_job_ids=[followup.id, final.id])
    pin = pins.pin("regions", record["id"], None, prepared, **options)
    assert pin.review == review
    assert [str(row.job_id) for row in pin.supporting_evidence] == options["supporting_job_ids"]
    assert pins.get("regions", verify=True) == pin
    assert pins.pin("regions", record["id"], None, prepared, **options) == pin
    assert pins.prepared("regions")["pin"]["review"] == review.model_dump(mode="json")
    with pytest.raises(ConflictError, match="immutable"):
        pins.pin(
            "regions",
            record["id"],
            None,
            prepared,
            review=review.model_copy(
                update={"limitations": "A different review must use a new case revision."}
            ),
            supporting_job_ids=[followup.id, final.id],
        )
    (settings.state_dir / "jobs" / final.id / "output" / "result.json").write_text(
        '{"changed":true}'
    )
    with pytest.raises(ValueError, match="follow-up evidence changed"):
        pins.get("regions", verify=True)


@pytest.mark.parametrize("selection", ["reverse", "duplicate", "root", "unrelated", "same_bytes"])
def test_record_followups_cannot_admit_unrelated_versions_or_invalid_order(settings, selection):
    pins, prepared, record, source, followup, final, review, original = study(settings)
    store = pins.store
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    unrelated = complete(settings, store, source.request)
    copied = scientific.create(
        VersionInput(
            asset_id=original.reference.asset_id, kind="molecule", label="Unrelated same bytes"
        ),
        uuid4(),
    )
    other_version = complete(
        settings,
        store,
        Properties(
            name="Unrelated same-byte version",
            ligand_files=[copied.reference.asset_id],
            scientific_inputs=[copied.reference],
        ),
    )
    identifiers = {
        "reverse": [final.id, followup.id],
        "duplicate": [followup.id, followup.id],
        "root": [source.id],
        "unrelated": [unrelated.id],
        "same_bytes": [other_version.id],
    }[selection]
    with pytest.raises(ValueError, match="distinct|dependency order"):
        pins.pin(
            "regions", record["id"], None, prepared, review=review, supporting_job_ids=identifiers
        )
    assert pins.get("regions") is None


def test_legacy_record_bytes_remain_unchanged_when_optional_review_fields_are_absent(settings):
    pins, prepared, record, _, _, _, _, _ = study(settings)
    pin = pins.pin("regions", record["id"], None, prepared)
    legacy = pin.model_dump(mode="json", exclude={"review", "supporting_evidence"})
    encoded = json.dumps(legacy)
    with pins.store.connect() as db:
        db.execute("UPDATE example_record_pins SET body=?", (encoded,))
    assert pins.get("regions", verify=True) == pin
    with pins.store.connect() as db:
        assert db.execute("SELECT body FROM example_record_pins").fetchone()[0] == encoded


def test_record_verification_rejects_forged_followup_lineage(settings):
    from opendde_workbench.examples.evidence import capture_job

    pins, prepared, record, source, followup, final, review, _ = study(settings)
    private = complete(settings, pins.store, source.request)
    pin = pins.pin(
        "regions",
        record["id"],
        None,
        prepared,
        review=review,
        supporting_job_ids=[followup.id, final.id],
    )
    changed = pin.model_copy(
        update={"supporting_evidence": (capture_job(pins.store, settings.state_dir, private.id),)}
    )
    with pins.store.connect() as db:
        db.execute("UPDATE example_record_pins SET body=?", (changed.model_dump_json(),))
    with pytest.raises(ValueError, match="dependency order"):
        pins.get("regions", verify=True)


def test_record_stages_survive_real_archive_restore_and_stay_out_of_personal_history(
    settings, tmp_path, monkeypatch
):
    pins, prepared, record, source, followup, final, review, _ = study(settings)
    private = complete(settings, pins.store, source.request)
    pin = pins.pin(
        "regions",
        record["id"],
        None,
        prepared,
        review=review,
        supporting_job_ids=[followup.id, final.id],
    )
    # Only public input/cache acquisition is isolated; typed records, lineage, archive,
    # assets, hashes, SQLite restore and immutable verification remain real.
    monkeypatch.setattr(BundleCatalogue, "prepare", lambda *args: prepared)
    monkeypatch.setattr(BundleCatalogue, "required_cache", lambda *args: ())
    archive = tmp_path / "reviewed-record.zip"
    receipt = export_bundle(settings, archive, "a" * 40, capabilities=["regions"])
    assert receipt["jobs"] == 3
    assert [job.id for job in ExampleLibrary(pins.store).personal_jobs(20, 0)] == [private.id]
    destination = replace(settings, state_dir=tmp_path / "restored")
    restore_bundle(archive, destination, receipt["sha256"])
    restore_bundle(archive, destination, receipt["sha256"])
    store = Store(destination.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, destination.state_dir / "assets")
    assert ExampleRecords(store, assets, destination).get("regions", verify=True) == pin
    assert not ExampleLibrary(store).personal_jobs(20, 0)
    assert store.get(private.id) is None


def test_record_pin_api_keeps_review_metadata_and_csrf_boundary(
    settings, client_factory, monkeypatch
):
    pins, prepared, record, _, followup, final, review, _ = study(settings)
    monkeypatch.setattr(
        "opendde_workbench.examples.routes.prepare_example", lambda *args, **kwargs: prepared
    )
    body = dict(
        record_id=record["id"],
        review=review.model_dump(mode="json"),
        supporting_job_ids=[followup.id, final.id],
    )
    with client_factory() as client:
        response = client.post("/api/examples/regions/record-pin?profile=archive", json=body)
        assert response.status_code == 200, response.text
        assert response.json()["review"] == body["review"]
        assert [row["job_id"] for row in response.json()["supporting_evidence"]] == body[
            "supporting_job_ids"
        ]
        assert pins.get("regions", verify=True).review == review
        client.headers.pop("X-Workbench-CSRF")
        assert (
            client.post("/api/examples/regions/record-pin?profile=archive", json=body).status_code
            == 403
        )
