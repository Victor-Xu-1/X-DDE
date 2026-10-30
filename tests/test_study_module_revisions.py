"""Exact authored module successors and historical native result restoration."""

import json
import os
from dataclasses import replace
from pathlib import Path

import pytest

from opendde_workbench.examples.bundle import restore_bundle, verify_examples
from opendde_workbench.examples.bundle_archive import sha256
from opendde_workbench.examples.bundle_catalogue import bundle_catalogue
from opendde_workbench.examples.catalogue_profiles import historical_study_catalogue
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6 import catalogue
from opendde_workbench.store import Store

PREVIOUS = "8327a0a86cec16f957699876c7bd6c76feb7f08a5a42a7f35828446f2e336946"
DATA24_SHA = "9512b41060d611056cafc13fb49c12a7f3dcfe4c3c0d34581b1412cf9e206d3e"
CHANGED = {"reinvent.design", "gnina.dock"}
QUALITY_PREDECESSOR = "49f1a7402ad83cb94feef91988430bf140991e9953e12eb50413c3e1e3a71f4e"


def test_only_the_authored_module_identities_advance():
    old = historical_study_catalogue(PREVIOUS)
    current = bundle_catalogue("stat6")
    assert set(old.modules) == set(current.modules)
    for key, previous in old.modules.items():
        revisions = {"gnina.dock": 5, "posebusters.check": 4}
        expected = (
            previous.model_copy(update={"revision": revisions.get(key, 4)})
            if (key in CHANGED | {"workflows", "predict", "pose_exploration", "posebusters.check"})
            else previous
        )
        assert current.modules[key] == expected
    assert all(old.modules[key].revision == 3 for key in CHANGED)
    assert current.digest != old.digest == PREVIOUS


def test_quality_successor_preserves_every_other_authored_module():
    previous = historical_study_catalogue(QUALITY_PREDECESSOR)
    current = bundle_catalogue("stat6")
    assert set(previous.modules) == set(current.modules)
    for key, module in previous.modules.items():
        expected = (
            module.model_copy(update={"revision": 4}) if key == "posebusters.check" else module
        )
        assert current.modules[key] == expected
    assert previous.modules["posebusters.check"].revision == 3
    assert current.digest != previous.digest == QUALITY_PREDECESSOR


@pytest.mark.parametrize("mutation", ["revision", "capability_id", "unknown_override"])
def test_frozen_module_changes_cannot_relabel_historical_evidence(tmp_path, monkeypatch, mutation):
    profiles = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_text())
    profile = profiles[PREVIOUS]
    if mutation == "unknown_override":
        profile["module_overrides"]["not.a.module"] = profile["module_overrides"]["gnina.dock"]
    else:
        profile["module_overrides"]["gnina.dock"][mutation] = (
            4 if mutation == "revision" else "reinvent.design"
        )
    (tmp_path / "catalogue-profiles.json").write_text(json.dumps(profiles))
    monkeypatch.setattr(catalogue, "ROOT", tmp_path)
    with pytest.raises(ValueError, match="module"):
        historical_study_catalogue(PREVIOUS)


def test_verification_cannot_use_a_catalogue_from_another_cohort(settings):
    with pytest.raises(ValueError, match="another study profile"):
        verify_examples(settings, profile="stat6", catalogue=bundle_catalogue("archive"))


def test_historical_preparation_uses_its_authored_module(settings):
    from test_stat6_templates import scientific_store

    store, scientific = scientific_store(settings.state_dir)
    old = historical_study_catalogue(PREVIOUS)
    prepared = old.prepare("reinvent.design", scientific, settings.state_dir / "cache", None)
    assert prepared.module == old.modules["reinvent.design"]
    assert prepared.module.revision == 3
    assert store.list_jobs() == []


def test_published_data24_restores_exact_old_pins_without_downgrading_new_ones(settings):
    source = os.environ.get("WB_TEST_DATA24")
    if not source:
        pytest.skip("The focused CI supplies the exact published 18MB native archive.")
    archive = Path(source)
    assert sha256(archive) == DATA24_SHA
    restored = replace(settings, state_dir=settings.state_dir / "legacy-import")
    first = restore_bundle(archive, restored, DATA24_SHA)
    assert first["modules"] == 43
    store = Store(restored.state_dir / "jobs.sqlite3")
    old_modules = historical_study_catalogue(PREVIOUS).modules
    old_pins = ExamplePins(store, restored.state_dir, modules=old_modules)
    before = {key: old_pins.get(key, verify=True) for key in CHANGED}
    assert all(pin is not None and pin.revision == 3 for pin in before.values())
    # A revision fixture reuses a sealed native run, rather than manufacturing
    # an output or running inference. Restore must not overwrite its identity.
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.examples.records import ExampleRecords
    from opendde_workbench.research.storage import ScientificStore

    current = bundle_catalogue("stat6")
    assets = AssetStore(store, restored.state_dir / "assets")
    records = ExampleRecords(store, assets, restored, modules=current.modules)
    prepared = current.prepare(
        "reinvent.design", ScientificStore(store, assets), restored.state_dir / "cache", records
    )
    pins = ExamplePins(store, restored.state_dir, modules=current.modules)
    new = pins.pin(
        "reinvent.design",
        before["reinvent.design"].job_id,
        prepared,
        review=before["reinvent.design"].review,
    )
    assert new.revision == 4
    assert restore_bundle(archive, restored, DATA24_SHA) == first
    assert pins.get("reinvent.design", verify=True) == new
    assert {key: old_pins.get(key, verify=True) for key in CHANGED} == before
    with store.connect() as db:
        assert not db.execute(
            "SELECT id FROM jobs WHERE status IN ('queued','running','cancelling')"
        ).fetchall()
