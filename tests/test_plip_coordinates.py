"""Nonconsecutive serials cannot redirect chemical contacts to different source atoms."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


def coordinates_class():
    file = Path(__file__).parents[1] / "src/opendde_workbench/integrations/plip_coordinates.py"
    spec = importlib.util.spec_from_file_location("plip_coordinate_contract", file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SourceCoordinates


def test_source_coordinates_keep_native_endpoint_and_residue_even_with_serial_gaps(tmp_path):
    file = tmp_path / "source.pdb"

    def atom(serial, name, residue, chain, number, point):
        return f"HETATM{serial:5d} {name:>4s} {residue:3s} {chain}{number:4d}    {point[0]:8.3f}{point[1]:8.3f}{point[2]:8.3f}  1.00 20.00           C  "

    file.write_text(
        atom(101, "CA", "ALA", "A", 33, (1, 2, 3))
        + "\n"
        + atom(999, "C1", "LIG", "Z", 1, (4, 2, 3))
        + "\n"
    )
    source = coordinates_class()(file, "Z", 1)
    assert source.atom(SimpleNamespace(coords=(1.0, 2.0, 3.0)), protein=("A", 33, "ALA")) == [
        1,
        2,
        3,
    ]
    assert source.atom(SimpleNamespace(coords=(4.0, 2.0, 3.0)), ligand=True) == [4, 2, 3]
    for value in ((37.0, 2.0, 3.0), (1.0, 2.0, 3.0)):
        with pytest.raises(ValueError, match="source frame or residue"):
            source.atom(SimpleNamespace(coords=value), ligand=True)
