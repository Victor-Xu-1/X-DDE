"""Current study/profile closure with real stores; fixtures never claim scientific results."""

import json
from dataclasses import replace
from uuid import uuid4

import pytest

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.examples.bundle_archive import read_archive, sha256, write_archive
from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def reviewed_fixture(settings, *, review=True, retry_status=None):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    catalogue = bundle_catalogue("stat6")
    prepared = catalogue.prepare(
        "properties",
        ScientificStore(store, assets),
        settings.state_dir / "public-example-cache",
        None,
    )
    request = TASK_ADAPTER.validate_python(prepared.request)
    parent = None
    if retry_status:
        previous = store.create(request, str(uuid4()), 20, 500)
        store.claim(previous.id)
        store.bind_environment(previous.id, capture(settings, "chemistry"))
        store.finish(previous.id, retry_status, "Controlled terminal retry history")
        parent = previous.id
    job = store.create(request, str(uuid4()), 20, 500, parent_id=parent)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "result.json").write_text('{"protocol_fixture":true,"scientific_inference":false}')
    store.bind_environment(job.id, capture(settings, "chemistry"))
    store.finish(job.id, Status.SUCCEEDED)
    pins = ExamplePins(store, settings.state_dir, modules=catalogue.modules)
    pin = pins.pin(
        "properties",
        job.id,
        prepared,
        review=ExampleReview(
            interpretation="Controlled bundle contract fixture; no scientific calculation ran.",
            limitations=(
                "This fixture tests immutable storage, not molecular predictions or acceptance."
            ),
            checked=(
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ),
        )
        if review
        else None,
    )
    return store, assets, job, pin


@pytest.mark.parametrize("status", [Status.FAILED, Status.CANCELLED, Status.INTERRUPTED])
def test_exact_terminal_retry_history_roundtrips_without_outputs_or_workers(
    settings, tmp_path, status
):
    store, _, job, _ = reviewed_fixture(settings, retry_status=status)
    before = store.get(job.parent_id)
    target = tmp_path / "retry-history.zip"
    export_bundle(settings, target, "a" * 40, capabilities=["properties"], profile="stat6")
    isolated = read_archive(target, tmp_path / "retry-read", sha256(target))
    # read_archive's manifest may be paired with staged paths; inspect the ZIP directly.
    import zipfile

    with zipfile.ZipFile(target) as archive:
        manifest = json.loads(archive.read("manifest.json"))
    assert len(manifest["records"]["jobs"]) == 2
    assert not any(name.startswith(f"jobs/{job.parent_id}/") for name in manifest["files"])
    destination = replace(settings, state_dir=tmp_path / "restored-retry")
    first = restore_bundle(target, destination, sha256(target))
    assert restore_bundle(target, destination, sha256(target)) == first
    restored = Store(destination.state_dir / "jobs.sqlite3")
    assert restored.get(job.id).parent_id == job.parent_id
    assert restored.get(job.parent_id).model_dump() == before.model_dump()
    assert all(
        row.status not in {"queued", "running", "cancelling"} for row in restored.list_jobs()
    )
    assert verify_examples(destination, ["properties"], profile="stat6")["computed"] == 1
    assert isolated is not None


def test_current_study_roundtrip_preserves_reviews_and_excludes_history(settings, tmp_path):
    store, assets, job, pin = reviewed_fixture(settings)
    private = store.create(
        job.request.model_copy(update={"name": "Private work"}), str(uuid4()), 20, 500
    )
    # A former archive revision of the same capability cannot leak into the current bundle.
    archive = bundle_catalogue("archive").modules["properties"]
    former = pin.model_copy(update={"case_id": archive.case_id, "revision": archive.revision})
    with store.connect() as db:
        db.execute(
            "INSERT INTO example_pins VALUES(?,?,?,?)",
            (
                "properties",
                archive.revision,
                str(job.id),
                former.model_dump_json(),
            ),
        )
    originals = {asset.id: assets.path(asset).read_bytes() for asset in assets.list()}
    target = tmp_path / "reviewed-study.zip"
    receipt = export_bundle(
        settings, target, "a" * 40, capabilities=["properties"], profile="stat6"
    )
    manifest = read_archive(target, tmp_path / "unpacked", receipt["sha256"])
    assert manifest["profile"] == "stat6"
    assert manifest["capabilities"] == ["properties"]
    assert manifest["records"]["example_pins"] == [dict_row_pin(store, pin.revision)]
    assert [row["id"] for row in manifest["records"]["jobs"]] == [job.id]
    assert private.id not in json.dumps(manifest)
    assert not any(name.startswith("public-example-cache/") for name in manifest["files"])
    assert any("9BIG" in url for url in manifest["notices"]["sources"])
    assert not any("3MXF" in url for url in manifest["notices"]["sources"])
    recovered = replace(settings, state_dir=tmp_path / "recovered")
    assert restore_bundle(target, recovered, receipt["sha256"]) == {
        "modules": 1,
        "computed": 1,
        "validated": 0,
    }
    assert restore_bundle(target, recovered, receipt["sha256"])["modules"] == 1
    recovered_store = Store(recovered.state_dir / "jobs.sqlite3")
    recovered_pin = ExamplePins(
        recovered_store, recovered.state_dir, modules=bundle_catalogue("stat6").modules
    ).get("properties", verify=True)
    assert recovered_pin == pin and recovered_pin.review == pin.review
    assert recovered_store.get(private.id) is None
    assert all(
        assets.path(assets.get(key)).read_bytes() == value for key, value in originals.items()
    )


def dict_row_pin(store, revision):
    with store.connect() as db:
        return dict(
            db.execute(
                "SELECT * FROM example_pins WHERE capability_id='properties' AND revision=?",
                (revision,),
            ).fetchone()
        )


def test_current_study_unreviewed_results_cannot_be_exported(settings, tmp_path):
    reviewed_fixture(settings, review=False)
    target = tmp_path / "unreviewed.zip"
    with pytest.raises(ValueError, match="explicit scientific and visual review"):
        export_bundle(settings, target, "a" * 40, capabilities=["properties"], profile="stat6")
    assert not target.exists()


@pytest.mark.parametrize(
    "field,value",
    [
        ("profile", "unreviewed"),
        ("catalogue_sha256", "0" * 64),
        ("capabilities", ["admet.predict"]),
    ],
)
def test_current_study_identity_and_declared_scope_are_not_replaceable(
    settings, tmp_path, field, value
):
    reviewed_fixture(settings)
    target = tmp_path / "reviewed.zip"
    export_bundle(settings, target, "a" * 40, capabilities=["properties"], profile="stat6")
    staging = tmp_path / "unpacked"
    manifest = read_archive(target, staging, sha256(target))
    manifest[field] = value
    changed = tmp_path / "changed.zip"
    write_archive(changed, manifest, {name: staging / name for name in manifest["files"]})
    recovered = replace(settings, state_dir=tmp_path / "recovered")
    with pytest.raises(ValueError):
        restore_bundle(changed, recovered, sha256(changed))
    store = Store(recovered.state_dir / "jobs.sqlite3")
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0


def test_no_result_template_is_not_an_accepted_bundle(settings):
    create_app(settings)
    with pytest.raises(ValueError, match="lacks a fixed example"):
        verify_examples(settings, ["properties"], profile="stat6")
