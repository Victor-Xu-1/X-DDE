"""A real single-assay template must satisfy the unchanged native training intake."""

import csv
import importlib.util
import json
import math
from decimal import Decimal
from pathlib import Path

import pytest
from test_stat6_templates import scientific_store

from opendde_workbench.examples.stat6.catalogue import FILES, verified_input
from opendde_workbench.examples.stat6.preparation import prepare_stat6


def native_consumer(monkeypatch):
    import opendde_workbench.integrations

    directory = Path(opendde_workbench.integrations.__file__).parent
    monkeypatch.syspath_prepend(str(directory))
    spec = importlib.util.spec_from_file_location(
        "reviewed_stat6_native_chemprop", directory / "native_chemprop.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_curated_spr_template_reaches_the_actual_native_input_table_without_training(
    tmp_path, monkeypatch
):
    chem = pytest.importorskip("rdkit.Chem")
    store, scientific = scientific_store(tmp_path)
    prepared = prepare_stat6("chemprop.train", scientific)
    request = prepared.request
    reference = prepared.objects["library"].reference
    source = scientific.assets.path(scientific.assets.get(reference.asset_id))
    before = source.read_bytes()
    assert before == verified_input("stat6_spr_library")
    assert request["payload"]["activity_property"] == request["payload"]["activity_unit"] == "pKd"
    assert request["inputs"] == [{"role": "library", "source": reference.model_dump(mode="json")}]
    native = native_consumer(monkeypatch)
    monkeypatch.setattr(native, "input_file", lambda actual, role: (source, reference))
    rows, molecules = native.input_table(request, tmp_path / "native-training.csv")
    proof = json.loads(verified_input("stat6_spr_provenance"))
    assert len(rows) == len(molecules) == len(proof["records"]) == 163
    assert len({row[0] for row in rows}) == 163
    for (smiles, label), molecule, record in zip(rows, molecules, proof["records"], strict=True):
        assert smiles == record["canonical_isomeric_smiles"]
        assert molecule.GetProp("BindingDB_MonomerID") == record["monomerid"]
        assert molecule.GetProp("BindingDB_ReactantSetID") == record["reaction_id"]
        assert molecule.GetProp("Reported_Kd_nM") == record["Kd_nM_reported"]
        assert molecule.GetProp("AssayID") == "BindingDB:13376:1"
        assert label == pytest.approx(
            9 - math.log10(float(Decimal(record["Kd_nM_reported"]))), abs=1e-12
        )
        assert not molecule.GetConformer().Is3D()
        assert all(str(s.specified) == "Specified" for s in chem.FindPotentialStereo(molecule))
    with (tmp_path / "native-training.csv").open() as stream:
        exported = list(csv.DictReader(stream))
    assert len(exported) == 163 and set(exported[0]) == {"smiles", "activity"}
    assert source.read_bytes() == before
    assert prepare_stat6("chemprop.train", scientific).objects["library"].reference == reference
    cellular = prepare_stat6("chemistry.screen", scientific)
    assert cellular.objects["library"].reference.sha256 == FILES["stat6_assay_library"].sha256
    assert (
        FILES["stat6_assay_library"].sha256
        == "00b497255bd1bad749d47f689e77b00e535018a0f70192a312da42b9981f53d4"
    )
    assert (
        FILES["stat6_measurements"].sha256
        == "92568eae46bd175c537e446427c9784a6743cfbb3761986da532385cf43c3ad3"
    )
    assert store.list_jobs() == []


def test_the_original_cellular_salts_are_not_silently_desalted_for_training(tmp_path, monkeypatch):
    pytest.importorskip("rdkit.Chem")
    source = tmp_path / "original-cellular.sdf"
    source.write_bytes(verified_input("stat6_assay_library"))
    native = native_consumer(monkeypatch)
    monkeypatch.setattr(native, "input_file", lambda actual, role: (source, {}))
    with pytest.raises(ValueError, match="invalid or disconnected"):
        native.input_table(
            {"operation": "chemprop_train", "payload": {"activity_property": "pIC50"}},
            tmp_path / "data.csv",
        )
    assert not (tmp_path / "data.csv").exists()


def test_a_small_clean_spr_subset_still_fails_the_unchanged_fifty_molecule_guard(
    tmp_path, monkeypatch
):
    chem = pytest.importorskip("rdkit.Chem")
    import io

    molecules = list(
        chem.ForwardSDMolSupplier(io.BytesIO(verified_input("stat6_spr_library")), removeHs=False)
    )
    source = tmp_path / "small-clean-spr.sdf"
    with chem.SDWriter(str(source)) as writer:
        for molecule in molecules[:38]:
            writer.write(molecule)
    native = native_consumer(monkeypatch)
    monkeypatch.setattr(native, "input_file", lambda actual, role: (source, {}))
    with pytest.raises(ValueError, match="at least 50 distinct labeled molecules"):
        native.input_table(
            {"operation": "chemprop_train", "payload": {"activity_property": "pKd"}},
            tmp_path / "small.csv",
        )
    assert not (tmp_path / "small.csv").exists()


def test_original_observations_exclusions_precision_and_assay_context_remain_distinct():
    proof = json.loads(verified_input("stat6_spr_provenance"))
    originals = {r["monomerid"]: r for r in proof["source_observations"]}
    retained = {r["monomerid"]: r for r in proof["records"]}
    excluded = {r["monomerid"]: r["reasons"] for r in proof["excluded_records"]}
    assert len(originals) == 192 and len(retained) == 163 and len(excluded) == 29
    assert set(retained).isdisjoint(excluded) and set(retained) | set(excluded) == set(originals)
    assert sum("unspecified_stereochemistry" in reasons for reasons in excluded.values()) == 5
    assert (
        sum(
            "duplicate_molecular_graph_across_source_ids" in reasons
            for reasons in excluded.values()
        )
        == 24
    )
    assert {r["assay_id"] for r in originals.values()} == {"BindingDB:13376:1"}
    assert {r["source_doi"] for r in originals.values()} == {"10.7270/Q2ZC87P0"}
    assert {r["relation"] for r in originals.values()} == {"="}
    assert {r["unit"] for r in originals.values()} == {"nM"}
    # These published decimals must not be replaced by the simplified API's rounded integers.
    assert originals["784429"]["Kd_nM_reported"] == "12.9"
    assert originals["784453"]["Kd_nM_reported"] == "15.7"
    assert proof["source_precision_corrections"] == 96
    assert proof["conditions"]["species"] == "Homo sapiens"
    assert proof["conditions"]["temperature_c"] == 25
    assert proof["conditions"]["running_buffer_ph"] is None
    assert proof["conditions"]["immobilization_buffer_ph"] == 5.5
    assert proof["license"] == FILES["stat6_spr_library"].license == "CC-BY-3.0-US"
    assert proof["training_or_inference_executed"] is False
    assert proof["experimental_validation_claimed"] is False
