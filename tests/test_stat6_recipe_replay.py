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
        retained = {
            table: set(db.execute("SELECT * FROM " + table).fetchall())
            for table in ("jobs", "example_pins", "example_record_pins")
        }
    different, record_examples, matched = [], [], []
    for capability in spec.CAPABILITIES:
        pin = pins.get(capability, verify=True)
        if pin is None:
            # A missing task recipe is acceptable only when the existing record
            # authority proves its immutable source, evidence and hydration.
            record = records.get(capability, verify=True)
            assert record is not None, "Unreviewed example: " + capability
            prepared = prepare_stat6(capability, scientific, records=records)
            assert prepared.record == records.prepared(capability)
            assert prepared.record["pin"] == record.model_dump(mode="json")
            assert records.get(capability, verify=True) == record
            record_examples.append(capability)
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
        for table, original in retained.items():
            assert set(db.execute("SELECT * FROM " + table).fetchall()) == original, table
    assert set(record_examples) == {"pose_exploration", "experimental.evidence", "regions"}
    assert not different, "Prepared recipes differ from reviewed native tasks: " + ", ".join(
        different
    )
    assert len(set(spec.CAPABILITIES)) == len(spec.CAPABILITIES)
    assert set(matched) | set(record_examples) == set(spec.CAPABILITIES)
    assert not set(matched) & set(record_examples)
    assert len(matched) == len(spec.CAPABILITIES) - len(record_examples)
    assert {"library.import", "library.select"} <= set(matched)
    destination = Path("outputs/reviewed-recipe-replay")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "native-recipes.json").write_text(
        json.dumps(
            {
                "matched_task_recipes": matched,
                "verified_record_examples": record_examples,
                "scientific_jobs_dispatched": 0,
                "original_jobs_unchanged": True,
            },
            indent=2,
        )
    )
