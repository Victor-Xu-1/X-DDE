"""Exact public prediction inputs and immutable published-catalogue compatibility."""

import copy
import hashlib
import json
from dataclasses import replace

import pytest
from test_stat6_case_bundle import reviewed_fixture
from test_stat6_templates import scientific_store

from opendde_workbench.examples.bundle import export_bundle, restore_bundle
from opendde_workbench.examples.bundle_archive import read_archive, sha256, write_archive
from opendde_workbench.examples.bundle_notices import bundle_notices
from opendde_workbench.examples.catalogue_profiles import compatible_modules
from opendde_workbench.examples.stat6 import catalogue
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.examples.stat6.reference_inputs import (
    PREDICTED_RECEIPTS,
    PREDICTED_STRUCTURES,
    case_for,
    visible_files,
)
from opendde_workbench.store import Store

HISTORICAL_CATALOGUE = "1ebec66f3a89e33947898d8d4173e964d07c7d9f274de39acab08ffd78588b60"


def test_prediction_construct_is_an_exact_atom_selection_of_the_public_model():
    proof = json.loads(catalogue.verified_input("stat6_prediction_provenance"))
    full = catalogue.verified_input("stat6_prediction")
    construct = catalogue.verified_input("stat6_predicted_construct")
    metadata = catalogue.verified_input("stat6_prediction_metadata")
    assert hashlib.sha256(full).hexdigest() == proof["source_sha256"]
    assert hashlib.sha256(construct).hexdigest() == proof["derived_sha256"]
    assert hashlib.sha256(metadata).hexdigest() == proof["metadata_sha256"]

    def atoms(data, *, selection=False):
        return {
            line[12:27]: line[30:66]
            for line in data.decode().splitlines()
            if line.startswith("ATOM  ")
            and (not selection or line[21] == "A" and 113 <= int(line[22:26]) <= 658)
        }

    actual = atoms(construct)
    assert actual == atoms(full, selection=True)
    assert len(actual) == proof["atoms"] == 4306
    assert len({key[9:] for key in actual}) == proof["observed_residues"] == 546
    record = next(row for row in json.loads(metadata) if row["modelEntityId"] == "AF-P42226-F1")
    assert record["uniprotAccession"] == "P42226" and record["latestVersion"] == 6
    assert record["sequence"] == "".join(
        catalogue.verified_input("stat6_sequence").decode().splitlines()[1:]
    )
    assert proof["model_kind"] == "predicted_reference_not_experimental_structure"
    assert proof["new_scientific_calculations"] == 0


def test_predicted_references_are_opt_in_to_relevant_modules_without_jobs(tmp_path):
    store, scientific = scientific_store(tmp_path)
    basic = prepare_stat6("properties", scientific)
    assert not set(PREDICTED_STRUCTURES) & basic.objects.keys()
    assert not set(PREDICTED_RECEIPTS) & basic.data_assets.keys()
    assert "alphafold" not in json.dumps(basic.case.model_dump())
    prepared = prepare_stat6("pose_exploration", scientific)
    repeated = prepare_stat6("pose.cluster", scientific)
    for key in PREDICTED_STRUCTURES:
        assert prepared.objects[key].reference == repeated.objects[key].reference
        assert scientific.assets.get(prepared.objects[key].reference.asset_id).sha256 == (
            catalogue.FILES[key].sha256
        )
    assert set(PREDICTED_RECEIPTS) <= prepared.data_assets.keys()
    assert prepared.case == case_for("pose_exploration")
    assert prepared.sources == prepared.case.sources
    assert not set(PREDICTED_RECEIPTS) & {spec.key for spec in visible_files("pose_exploration")}
    assert store.list_jobs() == []


def test_only_retained_optional_sources_add_their_notices():
    def notices(capability, retained):
        return bundle_notices(
            [capability],
            {"jobs": [], "assets": [{"sha256": catalogue.FILES[key].sha256} for key in retained]},
            modules=catalogue.MODULES,
            cases={catalogue.CASE.id: catalogue.CASE},
            files=catalogue.FILES,
        )

    assert not any("alphafold" in url for url in notices("properties", [])["sources"])
    retained = notices("pose_exploration", PREDICTED_STRUCTURES)
    assert catalogue.FILES["stat6_prediction"].url in retained["sources"]
    assert "CC-BY-4.0" in retained["licenses"]


def test_known_published_catalogue_accepts_only_unchanged_sources_and_modules(monkeypatch):
    assert set(compatible_modules(HISTORICAL_CATALOGUE, profile="stat6")) == set(catalogue.MODULES)
    with pytest.raises(ValueError, match="reviewed published"):
        compatible_modules("0" * 64, profile="stat6")
    changed = copy.deepcopy(catalogue.MANIFEST)
    changed["files"]["stat6_sequence"]["sha256"] = "0" * 64
    monkeypatch.setattr(catalogue, "MANIFEST", changed)
    with pytest.raises(ValueError, match="Historical study sources"):
        compatible_modules(HISTORICAL_CATALOGUE, profile="stat6")


def test_published_catalogue_module_mutation_is_not_a_compatibility_fallback(monkeypatch):
    changed = dict(catalogue.MODULES)
    changed["properties"] = changed["properties"].model_copy(update={"revision": 100})
    monkeypatch.setattr(catalogue, "MODULES", changed)
    with pytest.raises(ValueError, match="module revisions changed"):
        compatible_modules(HISTORICAL_CATALOGUE, profile="stat6")


def test_historical_catalogue_bundle_restores_idempotently_without_changing_native_rows(
    settings, tmp_path
):
    store, _, job, pin = reviewed_fixture(settings)
    target = tmp_path / "reviewed.zip"
    export_bundle(settings, target, "a" * 40, capabilities=["properties"], profile="stat6")
    staging = tmp_path / "unpacked"
    manifest = read_archive(target, staging, sha256(target))
    manifest["catalogue_sha256"] = HISTORICAL_CATALOGUE
    old = tmp_path / "historical.zip"
    write_archive(old, manifest, {name: staging / name for name in manifest["files"]})
    recovered = replace(settings, state_dir=tmp_path / "restored")
    expected = {"modules": 1, "computed": 1, "validated": 0}
    assert restore_bundle(old, recovered, sha256(old)) == expected
    assert restore_bundle(old, recovered, sha256(old)) == expected
    restored = Store(recovered.state_dir / "jobs.sqlite3")
    assert restored.get(job.id).model_dump_json() == store.get(job.id).model_dump_json()
    with restored.connect() as db:
        body = db.execute("SELECT body FROM example_pins").fetchone()[0]
    assert json.loads(body) == pin.model_dump(mode="json")
