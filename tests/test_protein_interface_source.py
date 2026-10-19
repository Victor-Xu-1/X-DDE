"""Insertion-coded polymer residues retain distinct original identities."""

import importlib
from pathlib import Path

import pytest


def test_insertion_codes_cannot_collapse_distinct_polymer_residues(tmp_path, monkeypatch):
    native = Path(__file__).parents[1] / "src/opendde_workbench/integrations"
    monkeypatch.syspath_prepend(str(native))
    source = importlib.import_module("plip_interface_source")
    rows = []
    for serial, (chain, number, code, x) in enumerate(
        (("A", 10, "A", 1), ("A", 10, "B", 2), ("B", 20, "", 3)), 1
    ):
        rows.append(
            f"ATOM  {serial:5d}   CA ALA {chain}{number:4d}{code:1s}   {x:8.3f}{0:8.3f}{0:8.3f}  1.00 50.00           C  \n"
        )
    file = tmp_path / "insertions.pdb"
    file.write_text("".join(rows))
    coordinates = source.InterfaceCoordinates(file, ["A"], ["B"])
    assert coordinates.expected == {
        ("A", 10, "ALA", "A"),
        ("A", 10, "ALA", "B"),
        ("B", 20, "ALA", ""),
    }
    coordinates.point((1, 0, 0), protein=("A", 10, "ALA"))
    coordinates.point((3, 0, 0), ligand=True)
    from types import SimpleNamespace

    row = {"kind": "hydrophobic", "protein_position": [1, 0, 0], "ligand_position": [3, 0, 0]}
    native_row = SimpleNamespace(
        reschain="A", resnr=10, restype="ALA", reschain_l="B", resnr_l=20, restype_l="ALA"
    )
    assert coordinates.annotate(row, native_row)["insertion_code"] == "A"
    with pytest.raises(ValueError, match="source frame or chain"):
        coordinates.point((1.01, 0, 0), protein=("A", 10, "ALA"))
