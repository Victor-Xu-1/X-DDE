"""Hydrate real retained recipes in isolated CI state, without scientific execution."""

import json
import os
from pathlib import Path

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples import stat6_bundle_release as spec
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store

pytestmark = pytest.mark.skipif(
    not os.environ.get("WB_REVIEWED_STAT6_ARCHIVE"), reason="Requires the real immutable data gate."
)


def test_every_retained_native_task_recipe_replays_exactly_without_starting_jobs(settings):
    restore_bundle(Path(os.environ["WB_REVIEWED_STAT6_ARCHIVE"]), settings, spec.SHA256)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings, modules=MODULES)
    pins = ExamplePins(store, settings.state_dir, modules=MODULES)
    with store.connect() as db:
        original_jobs = set(db.execute("SELECT * FROM jobs").fetchall())
    different, compound, matched = [], [], []
    for capability in spec.CAPABILITIES:
        pin = pins.get(capability, verify=True)
        if pin is None:
            compound.append(capability)
            continue
        original = pins.request(capability, reviewed=True)
        prepared = prepare_stat6(capability, scientific, records=records)
        if prepared.request != original:
            different.append(capability)
        else:
            matched.append(capability)
        # Hydration must not rewrite an old authored request or its evidence.
        assert pins.get(capability, verify=True) == pin
    with store.connect() as db:
        assert set(db.execute("SELECT * FROM jobs").fetchall()) == original_jobs
    assert compound == ["pose_exploration"]
    assert not different, "Prepared recipes differ from reviewed native tasks: " + ", ".join(
        different
    )
    assert len(matched) == 29
    assert {"library.import", "library.select"} <= set(matched)
    destination = Path("outputs/reviewed-recipe-replay")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "native-recipes.json").write_text(
        json.dumps(
            {
                "matched_task_recipes": matched,
                "compound_record_requires_separate_review": compound,
                "scientific_jobs_dispatched": 0,
                "original_jobs_unchanged": True,
            },
            indent=2,
        )
    )
