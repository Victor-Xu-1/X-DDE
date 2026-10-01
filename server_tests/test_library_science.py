"""Real fixed RDKit parsing, fingerprint/substructure/diversity and immutable selection evidence."""

import hashlib
import importlib.util
import sys
from pathlib import Path
from uuid import uuid4

import pytest

Chem = pytest.importorskip("rdkit.Chem")


@pytest.fixture
def native(monkeypatch):
    folder = Path("src/opendde_workbench/chemistry").resolve()
    monkeypatch.syspath_prepend(str(folder))
    modules = {}
    for name in ("screen_options", "screen_io", "native_screen"):
        spec = importlib.util.spec_from_file_location(name, folder / (name + ".py"))
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        modules[name] = module
    return modules


def input_library(tmp_path):
    root = tmp_path / "assets"
    root.mkdir()
    file = root / "library.sdf"
    with Chem.SDWriter(str(file)) as writer:
        for smiles in ("CCO", "CCO", "CCCO", "c1ccccc1", "[Na+].[Cl-]"):
            writer.write(Chem.MolFromSmiles(smiles))
    library = {"asset_id": str(uuid4()), "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
    query = {**library, "record": 0, "conformer": 0}
    return library, query, {library["asset_id"]: "/job/assets/library.sdf"}, file


def test_actual_library_methods_and_original_record_mapping(native, tmp_path):
    library, query, bindings, file = input_library(tmp_path)
    original = file.read_bytes()
    for mode in ("inventory", "similarity", "substructure", "diversity", "filter"):
        output = tmp_path / mode
        output.mkdir()
        options = native["screen_options"].ScreenOptions(
            mode=mode, max_selected=3, minimum_similarity=0.4, minimum_mw=0, maximum_mw=50
        )
        request = {
            "operation": "library_screen",
            "library": library,
            "query": query if mode in {"similarity", "substructure"} else None,
            "options": options.model_dump(mode="json"),
        }
        result = native["native_screen"].run_screen(request, bindings, tmp_path, output)
        assert (
            len(result["rows"]) == 5
            and result["rows"][1]["available"]
            and not result["rows"][1]["eligible"]
        )
        assert result["rows"][0]["descriptors"]["mw"] == pytest.approx(46.069, abs=0.002)
        assert result["rows"][4]["descriptors"]["fragments"] == 2
        molecules = list(Chem.SDMolSupplier(str(output / result["artifact"]), removeHs=False))
        assert len(molecules) == len(result["selected_records"]) <= 3
        source = list(Chem.SDMolSupplier(str(file), removeHs=False))
        for record, molecule in zip(result["selected_records"], molecules, strict=True):
            assert Chem.MolToSmiles(molecule) == Chem.MolToSmiles(source[record])
        if mode == "similarity":
            assert result["selected_records"][0] == 0 and result["rows"][0]["similarity"] == 1
        if mode == "substructure":
            assert result["selected_records"] == [0, 2]
        if mode == "filter":
            assert result["selected_records"] == [0]
        if mode == "diversity":
            assert (
                native["native_screen"].run_screen(request, bindings, tmp_path, output)[
                    "selected_records"
                ]
                == result["selected_records"]
            )
    assert file.read_bytes() == original


def test_invalid_and_excessive_library_records_are_not_silently_dropped(native, tmp_path):
    library, query, bindings, file = input_library(tmp_path)
    with file.open("a") as stream:
        stream.write("invalid record\n$$$$\n")
    library["sha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
    output = tmp_path / "output"
    output.mkdir()
    result = native["native_screen"].run_screen(
        {
            "library": library,
            "query": None,
            "options": native["screen_options"].ScreenOptions().model_dump(mode="json"),
        },
        bindings,
        tmp_path,
        output,
    )
    assert (
        len(result["rows"]) == 6
        and not result["rows"][-1]["available"]
        and result["rows"][-1]["reason"]
    )
    file.write_text("invalid\n$$$$\n" * 501)
    library["sha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
    with pytest.raises(ValueError, match="500"):
        native["screen_io"].read_sdf(library, bindings, tmp_path)


def test_source_record_indices_and_sd_properties_survive_invalid_middle_and_eof(native, tmp_path):
    library, query, bindings, file = input_library(tmp_path)
    original = file.read_bytes()
    parts = original.split(b"$$$$\n")
    first = parts[0] + b"> <SOURCE_TAG>\noriginal record\n\n"
    file.write_bytes(first + b"$$$$\ninvalid\n$$$$\n" + parts[1])
    library["sha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
    records = native["screen_io"].read_sdf(library, bindings, tmp_path)
    assert (
        len(records) == 3
        and records[0] is not None
        and records[1] is None
        and records[2] is not None
    )
    assert records[0].GetProp("SOURCE_TAG") == "original record"
    assert Chem.MolToSmiles(records[2]) == "CCO"
