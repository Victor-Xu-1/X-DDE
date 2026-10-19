"""Published DEL archive restoration and strict catalogue boundaries; no workers start."""

import copy
import hashlib
import json
import os
from pathlib import Path

import pytest

from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.catalogue_profiles import compatible_modules
from opendde_workbench.examples.del6 import catalogue
from opendde_workbench.examples.del6.compatibility import digest
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.store import Store

PREVIOUS = "7ef51d6407a65c496223d3d67a03d386a364b6e07fb24445136d3645c6593eb5"
ARCHIVE_SHA = "b210b9c0a270f59b4f292440f1140c2a0c71a705a79c6b306e8373a49a929645"


def test_only_the_published_historical_del_scope_is_allowed():
    assert compatible_modules(PREVIOUS, profile="del6") == ("del.library",)
    with pytest.raises(ValueError, match="not a reviewed"):
        compatible_modules("a" * 64, profile="del6")


@pytest.mark.parametrize("field", ["files", "modules", "source_revision"])
def test_changed_current_scientific_sources_close_historical_restore(monkeypatch, field):
    changed = copy.deepcopy(catalogue.MANIFEST)
    changed[field] = {"unreviewed": True}
    monkeypatch.setattr(catalogue, "MANIFEST", changed)
    with pytest.raises(ValueError, match="not a reviewed"):
        compatible_modules(PREVIOUS, profile="del6")


def test_historical_manifest_mutation_is_rejected(tmp_path, monkeypatch):
    for name in ("catalogue-profiles.json", "manifest-v1.json"):
        (tmp_path / name).write_bytes((catalogue.ROOT / name).read_bytes())
    old = json.loads((tmp_path / "manifest-v1.json").read_bytes())
    old["case"]["description"] = ["Changed document", "Changed document"]
    (tmp_path / "manifest-v1.json").write_text(json.dumps(old), encoding="utf-8")
    monkeypatch.setattr(catalogue, "ROOT", tmp_path)
    with pytest.raises(ValueError, match="manifest changed"):
        compatible_modules(PREVIOUS, profile="del6")


def test_registry_does_not_allow_scientific_replacement_even_if_current_hash_is_added(
    tmp_path, monkeypatch
):
    profiles = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_bytes())
    (tmp_path / "manifest-v1.json").write_bytes((catalogue.ROOT / "manifest-v1.json").read_bytes())
    changed = copy.deepcopy(catalogue.MANIFEST)
    changed["source_revision"] = "a" * 40
    profiles["catalogues"][digest(changed)] = {"module_ids": sorted(catalogue.MODULES)}
    (tmp_path / "catalogue-profiles.json").write_text(json.dumps(profiles), encoding="utf-8")
    monkeypatch.setattr(catalogue, "ROOT", tmp_path)
    monkeypatch.setattr(catalogue, "MANIFEST", changed)
    with pytest.raises(ValueError, match="scientific sources"):
        compatible_modules(PREVIOUS, profile="del6")


def test_published_del_data1_cold_and_repeat_restore_without_personal_jobs(settings):
    source = os.environ.get("WB_REVIEWED_DEL_DATA1")
    if not source:
        pytest.skip("Provide the exact published DEL Data1 archive for its cold-restore check.")
    archive = Path(source)
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA
    expected = {"modules": 1, "computed": 1, "validated": 0}
    assert restore_bundle(archive, settings, ARCHIVE_SHA) == expected
    store = Store(settings.state_dir / "jobs.sqlite3")
    pins = ExamplePins(store, settings.state_dir, modules=catalogue.MODULES)
    pin = pins.get("del.library", verify=True)
    assert str(pin.job_id) == "07e44626-842d-40a3-b74c-47b65927f7d2"
    assert pin.review and pin.review.scope == "reviewed_computational_example"
    original_files = {
        str(path.relative_to(settings.state_dir)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (settings.state_dir / "jobs").rglob("*")
        if path.is_file()
    }
    assert restore_bundle(archive, settings, ARCHIVE_SHA) == expected
    assert pins.get("del.library", verify=True) == pin
    assert original_files == {
        str(path.relative_to(settings.state_dir)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (settings.state_dir / "jobs").rglob("*")
        if path.is_file()
    }
    assert not ExampleLibrary(store).personal_jobs(20, 0)
    assert all(row.status not in {"queued", "running", "cancelling"} for row in store.list_jobs())
