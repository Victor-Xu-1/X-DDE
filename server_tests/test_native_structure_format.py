"""Real mmCIF/PDB serialization controls for original identifiers and coordinates."""

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from Bio.PDB import MMCIFIO, Atom, Chain, MMCIFParser, Model, PDBParser, Residue, Structure


def complex_model(component="A1AQQ", existing_alias=False):
    structure = Structure.Structure("format-control")
    model, chain = Model.Model(0), Chain.Chain("A")
    structure.add(model)
    model.add(chain)
    protein = Residue.Residue((" ", 614, " "), "ALA", " ")
    chain.add(protein)
    protein.add(
        Atom.Atom("CA", np.array([1.23456, -2.34567, 3.45678]), 20, 1, " ", " CA ", 101, "C")
    )
    ligand = Residue.Residue(("H_" + component, 701, " "), component, " ")
    chain.add(ligand)
    for name, element, serial, point in (
        ("N1", "N", 305, [4.315, -46.375, -29.706]),
        ("C1", "C", 509, [5.701, -46.085, -29.210]),
        ("O1", "O", 710, [6.230, -47.009, -28.640]),
    ):
        ligand.add(Atom.Atom(name, np.array(point), 30, 1, " ", name.rjust(4), serial, element))
    if existing_alias:
        residue = Residue.Residue(("H_X00", 702, " "), "X00", " ")
        chain.add(residue)
        residue.add(Atom.Atom("C1", np.array([20, 20, 20]), 10, 1, " ", " C1 ", 900, "C"))
    return structure


@pytest.fixture
def serializer(tmp_path, monkeypatch):
    root = Path(__file__).parents[1] / "src/opendde_workbench/integrations"
    monkeypatch.syspath_prepend(str(root))
    shared_spec = importlib.util.spec_from_file_location(
        "receptor_native_io", root.parent / "receptors/native_io.py"
    )
    shared = importlib.util.module_from_spec(shared_spec)
    shared_spec.loader.exec_module(shared)
    monkeypatch.setitem(sys.modules, "receptor_native_io", shared)
    spec = importlib.util.spec_from_file_location(
        "native_structure_format", root / "native_structure.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "OUTPUT", tmp_path / "private-native-inputs")
    return module


def source(tmp_path, monkeypatch, serializer, structure):
    file = tmp_path / "source.cif"
    writer = MMCIFIO()
    writer.set_structure(structure)
    writer.save(str(file), preserve_atom_numbering=True)
    reference = {"asset_id": "original", "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
    monkeypatch.setattr(serializer, "input_file", lambda request, role: (file, reference))
    return file, reference


def test_long_component_translation_preserves_source_frame_serials_and_collision_free_identity(
    tmp_path, monkeypatch, serializer
):
    file, reference = source(tmp_path, monkeypatch, serializer, complex_model(existing_alias=True))
    original = file.read_bytes()
    converted, retained = serializer.input_pdb({}, allow_component_aliases=True)
    assert retained == reference and file.read_bytes() == original
    parsed = PDBParser(QUIET=True).get_structure("native", str(converted))
    assert parsed[0]["A"][("H_X01", 701, " ")].resname == "X01"
    assert parsed[0]["A"][("H_X00", 702, " ")].resname == "X00"
    raw = MMCIFParser(QUIET=True).get_structure("original", str(file))
    assert [atom.serial_number for atom in parsed.get_atoms()] == [101, 305, 509, 710, 900]
    for before, after in zip(raw.get_atoms(), parsed.get_atoms(), strict=True):
        assert before.name == after.name and before.element == after.element
        assert np.max(np.abs(before.coord - after.coord)) <= 0.00051
    receipt = json.loads((converted.parent / "structure-component-identifiers.json").read_text())
    assert receipt["source"] == reference and receipt["component_aliases"] == {"A1AQQ": "X01"}
    assert b"A1AQQ" in original and b"A1AQQ" not in converted.read_bytes()


def test_unreviewed_program_rejects_unrepresentable_component_before_output(
    tmp_path, monkeypatch, serializer
):
    file, _ = source(tmp_path, monkeypatch, serializer, complex_model())
    original = file.read_bytes()
    with pytest.raises(ValueError, match="component-identifier translation"):
        serializer.input_pdb({})
    assert file.read_bytes() == original and not serializer.OUTPUT.exists()


def test_ordinary_component_codes_stay_unchanged(tmp_path, monkeypatch, serializer):
    file, _ = source(tmp_path, monkeypatch, serializer, complex_model("LIG"))
    original = file.read_bytes()
    converted, _ = serializer.input_pdb({})
    lines = [line for line in converted.read_text().splitlines() if line.startswith("HETATM")]
    assert all(
        line[17:20] == "LIG" and line[21] == "A" and int(line[22:26]) == 701 for line in lines
    )
    assert file.read_bytes() == original
    assert not (converted.parent / "structure-component-identifiers.json").exists()


@pytest.mark.parametrize(
    "invalid", ["coordinate", "residue_number", "atom_name", "atom_number", "chain"]
)
def test_bad_native_fields_cannot_be_silently_recentered_or_renumbered(
    tmp_path, monkeypatch, serializer, invalid
):
    structure = complex_model("LIG")
    model, atom = structure[0], next(structure.get_atoms())
    if invalid == "coordinate":
        atom.set_coord(np.array([10000, 0, 0]))
    elif invalid == "residue_number":
        model["A"][(" ", 614, " ")].id = (" ", 10000, " ")
    elif invalid == "atom_name":
        atom.name, atom.fullname = "CA123", "CA123"
    elif invalid == "atom_number":
        atom.serial_number = 100000
    else:
        model["A"].id = "AA"
    file, _ = source(tmp_path, monkeypatch, serializer, structure)
    original = file.read_bytes()
    with pytest.raises(ValueError):
        serializer.input_pdb({})
    assert file.read_bytes() == original and not serializer.OUTPUT.exists()


def test_alternate_locations_are_preserved_without_an_implicit_transport_selection(
    tmp_path, monkeypatch, serializer
):
    structure = complex_model("LIG")
    residue = structure[0]["A"][(" ", 614, " ")]
    residue.detach_child("CA")
    alternate = Atom.DisorderedAtom("CA")
    for code, serial, point in (("A", 101, [1, 2, 3]), ("B", 102, [1.5, 2.5, 3.5])):
        alternate.disordered_add(
            Atom.Atom("CA", np.array(point), 20, 0.5, code, " CA ", serial, "C")
        )
    residue.add(alternate)
    file, _ = source(tmp_path, monkeypatch, serializer, structure)
    original = file.read_bytes()
    converted, _ = serializer.input_pdb({})
    parsed = PDBParser(QUIET=True).get_structure("native", str(converted))
    atom = parsed[0]["A"][(" ", 614, " ")]["CA"]
    assert set(atom.child_dict) == {"A", "B"}
    assert np.allclose(atom.child_dict["A"].coord, [1, 2, 3])
    assert np.allclose(atom.child_dict["B"].coord, [1.5, 2.5, 3.5])
    assert file.read_bytes() == original
