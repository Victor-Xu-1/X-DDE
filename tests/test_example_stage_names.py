"""Stage captions identify native molecules without changing the sealed job requests."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.chemistry.minimization_contract import MoleculeMinimizeTask
from opendde_workbench.examples.supporting import supporting_stage_names
from opendde_workbench.models import Status
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def stages(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    # This is a storage-only protocol fixture; no scientific output or claim is fabricated.
    asset = assets.save("protocol-records.sdf", "ligand", b"Protocol fixture\n$$$$\n")
    jobs = []
    for record, label in enumerate(("CHEMBL487451", "CHEMBL374380", "CHEMBL520539")):
        source = scientific.create(
            VersionInput(asset_id=asset.id, kind="molecule", label=label, record=record),
            uuid4(),
        )
        job = store.create(
            MoleculeMinimizeTask(name="Initial optimized 3D preview", molecule=source.reference),
            str(uuid4()),
            20,
            500,
        )
        store.claim(job.id)
        store.finish(job.id, Status.SUCCEEDED)
        jobs.append(store.get(job.id))
    pin = SimpleNamespace(supporting_evidence=[SimpleNamespace(job_id=job.id) for job in jobs])
    return store, jobs, pin


def test_repeated_optimization_captions_retain_the_exact_public_source_name(settings):
    store, jobs, pin = stages(settings)
    before = {job.id: job.model_dump() for job in jobs}
    captions = supporting_stage_names(store, pin)
    assert [captions[job.id] for job in jobs] == [
        "Initial optimized 3D preview · " + label
        for label in ("CHEMBL487451", "CHEMBL374380", "CHEMBL520539")
    ]
    assert {job.id: store.get(job.id).model_dump() for job in jobs} == before


@pytest.mark.parametrize("mismatch", ["record", "sha256", "missing"])
def test_a_missing_or_inconsistent_version_never_supplies_an_unrelated_caption(settings, mismatch):
    store, jobs, pin = stages(settings)
    source = jobs[0].request.molecule
    with store.connect() as db:
        if mismatch == "missing":
            db.execute("DELETE FROM scientific_objects WHERE id=?", (str(source.version_id),))
        else:
            db.execute(
                "UPDATE scientific_objects SET body=json_set(body,?,?) WHERE id=?",
                (
                    "$.reference." + mismatch,
                    499 if mismatch == "record" else "f" * 64,
                    str(source.version_id),
                ),
            )
    captions = supporting_stage_names(store, pin)
    assert captions[jobs[0].id] == jobs[0].request.name
    assert "CHEMBL487451" not in captions[jobs[0].id]


def test_unique_authored_stage_names_and_empty_cases_are_preserved(settings):
    store, jobs, pin = stages(settings)
    pin.supporting_evidence = pin.supporting_evidence[:1]
    assert supporting_stage_names(store, pin) == {jobs[0].id: jobs[0].request.name}
    assert supporting_stage_names(store, None) == {}
