"""Native provenance graph boundaries using protocol files, never R&D results."""

from uuid import UUID, uuid4

import pytest
from test_example_pins import fixture

from opendde_workbench.examples.pin_validation import validate_input_lineage
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import Properties
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore


def result_version(settings, store, assets, job, number):
    raw = f"Protocol native file {number}; not a molecular model\n$$$$\n".encode()
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True, exist_ok=True)
    (output / "native-output.sdf").write_bytes(raw)
    asset = assets.save("native-output.sdf", "ligand", raw)
    return ScientificStore(store, assets).create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Protocol native output"),
        uuid4(),
        source_job=job.id,
    )


def stage(settings, store, reference):
    job = store.create(
        Properties(
            name="Protocol derived stage",
            ligand_files=[reference.asset_id],
            scientific_inputs=[reference],
        ),
        str(uuid4()),
        20,
        500,
    )
    store.claim(job.id)
    store.bind_environment(job.id, capture(settings, "chemistry"))
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "result.json").write_text('{"protocol_fixture":true}')
    store.finish(job.id, Status.SUCCEEDED)
    return store.get(job.id)


def chain(settings):
    store, assets, prepared, first, _, _ = fixture(settings)
    store.finish(first.id, Status.SUCCEEDED)
    first = store.get(first.id)
    one = result_version(settings, store, assets, first, 1)
    second = stage(settings, store, one.reference)
    two = result_version(settings, store, assets, second, 2)
    target = stage(settings, store, two.reference)
    return store, assets, prepared, first, second, target, one, two


def test_unpinned_native_stages_are_accepted_only_through_verified_exact_output_versions(settings):
    store, _, prepared, first, second, target, _, _ = chain(settings)
    validate_input_lineage(target, prepared, store)
    assert all(store.get(job.id).status == "succeeded" for job in (first, second, target))


@pytest.mark.parametrize(
    "mutation",
    [
        "unrelated_leaf",
        "same_bytes_version",
        "unretained_output",
        "changed_output",
        "failed_source",
        "unqualified",
    ],
)
def test_native_graph_cannot_admit_foreign_or_unproved_inputs(settings, mutation):
    store, assets, prepared, first, second, target, one, two = chain(settings)
    scientific = ScientificStore(store, assets)
    if mutation == "unrelated_leaf":
        asset = assets.save("private.sdf", "ligand", b"Unrelated private input\n$$$$\n")
        foreign = scientific.create(
            VersionInput(asset_id=asset.id, kind="molecule", label="Private"), uuid4()
        )
        changed = first.request.model_copy(
            update={"ligand_files": [UUID(asset.id)], "scientific_inputs": [foreign.reference]}
        )
        with store.connect() as db:
            db.execute(
                "UPDATE jobs SET request=? WHERE id=?", (changed.model_dump_json(), first.id)
            )
    elif mutation == "same_bytes_version":
        foreign = scientific.create(
            VersionInput(
                asset_id=two.reference.asset_id, kind="molecule", label="Unrelated same bytes"
            ),
            uuid4(),
        )
        target = stage(settings, store, foreign.reference)
    elif mutation == "unretained_output":
        asset = assets.save("not-an-output.sdf", "ligand", b"Unretained output bytes\n$$$$\n")
        forged = scientific.create(
            VersionInput(asset_id=asset.id, kind="molecule", label="Unretained"),
            uuid4(),
            source_job=second.id,
        )
        target = stage(settings, store, forged.reference)
    elif mutation == "changed_output":
        (settings.state_dir / "jobs" / first.id / "output/native-output.sdf").write_bytes(
            b"Changed native output"
        )
    elif mutation == "failed_source":
        with store.connect() as db:
            db.execute("UPDATE jobs SET status='failed' WHERE id=?", (first.id,))
    else:
        target = stage(settings, store, two.reference.model_copy(update={"version_id": None}))
    with pytest.raises(
        ValueError, match="lineage|native output|scientific version|successful native task"
    ):
        validate_input_lineage(target, prepared, store)


def test_cyclic_native_source_graph_fails_without_retrying_or_recursing_forever(settings):
    store, _, prepared, first, _, target, _, two = chain(settings)
    changed = first.request.model_copy(
        update={"ligand_files": [two.reference.asset_id], "scientific_inputs": [two.reference]}
    )
    with store.connect() as db:
        db.execute("UPDATE jobs SET request=? WHERE id=?", (changed.model_dump_json(), first.id))
    with pytest.raises(ValueError, match="cyclic|budget"):
        validate_input_lineage(target, prepared, store)


def test_missing_environment_is_not_replaced_by_a_success_status(settings):
    store, _, prepared, first, _, target, _, _ = chain(settings)
    with store.connect() as db:
        db.execute("DELETE FROM job_environments WHERE job_id=?", (first.id,))
    with pytest.raises(ValueError, match="lineage|native output|environment"):
        validate_input_lineage(target, prepared, store)


def test_prior_case_pin_is_verified_before_its_output_becomes_an_anchor(settings):
    from opendde_workbench.examples.pins import ExamplePins

    store, _, prepared, first, _, target, _, _ = chain(settings)
    ExamplePins(store, settings.state_dir).pin("properties", first.id, prepared)
    validate_input_lineage(target, prepared, store)
    (settings.state_dir / "jobs" / first.id / "output/native-output.sdf").write_bytes(b"Changed")
    with pytest.raises(ValueError, match="output bytes changed"):
        validate_input_lineage(target, prepared, store)


@pytest.mark.parametrize("limit", ["MAX_SOURCE_DEPTH", "MAX_SOURCE_JOBS"])
def test_native_source_proof_has_explicit_depth_and_job_budgets(settings, monkeypatch, limit):
    from opendde_workbench.examples import input_lineage

    store, _, prepared, _, _, target, _, _ = chain(settings)
    monkeypatch.setattr(input_lineage, limit, 1)
    with pytest.raises(ValueError, match="budget"):
        validate_input_lineage(target, prepared, store)
