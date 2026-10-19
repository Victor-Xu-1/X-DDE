"""The real phosphorylated source must survive selection, adaptation and mmCIF export."""

import hashlib
from pathlib import Path

import numpy as np
import pytest


def test_deposited_phosphotyrosine_atoms_and_polymer_annotations_roundtrip(tmp_path, monkeypatch):
    from opendde_workbench.structure_comparison.native_export import (
        verify_export,
        write_compared_model,
    )
    from opendde_workbench.structure_comparison.native_polymer import selected_polymer
    from opendde_workbench.structure_comparison.native_quality_model import (
        heavy_coordinates,
        quality_model,
    )

    folder = Path(__file__).parents[1] / "src/opendde_workbench/receptors"
    monkeypatch.syspath_prepend(str(folder))
    from native_io import read_model
    from selection import MemberSelection

    source = folder.parent / "examples/stat6/inputs/4Y5U.cif"
    original_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    assert original_sha == "e4a6ffaa490671b76ff5e7aa475a6011fdc0bb8889314a9c4ed92a8c49c03fdb"
    model, _ = read_model(source, MemberSelection(chains=("A", "B")))
    selected, codes, details = selected_polymer(source, model)
    assert details["polymer_residues"] == 883
    assert {
        (row["chain"], row["number"], row["residue"], row["parent"])
        for row in details["modified_residues"]
    } == {("A", 641, "PTR", "TYR"), ("B", 641, "PTR", "TYR")}
    native = quality_model(selected, codes, "native-source-check")
    assert heavy_coordinates(native) == heavy_coordinates(selected)
    assert all(
        sum(res.resname == "PTR" and len(res) == 16 for res in chain) == 1 for chain in native
    )
    output = tmp_path / "selected.cif"
    write_compared_model(selected, details["modified_residues"], output)
    restored, _ = read_model(output, MemberSelection(chains=("A", "B")))
    again, _, metadata = selected_polymer(output, restored)
    assert metadata["polymer_residues"] == 883
    assert metadata["modified_residues"] == details["modified_residues"]
    assert heavy_coordinates(again) == heavy_coordinates(selected)
    atom = next(again.get_atoms())
    atom.set_coord(atom.coord + np.array([0.5, 0, 0]))
    with pytest.raises(ValueError, match="changed source identities or aligned coordinates"):
        verify_export(again, output)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_sha


def test_missing_pdb_modification_annotations_cannot_silently_remove_real_stat6_PTR(
    tmp_path, monkeypatch
):
    from Bio.PDB import PDBIO

    from opendde_workbench.structure_comparison.native_polymer import selected_polymer

    folder = Path(__file__).parents[1] / "src/opendde_workbench/receptors"
    monkeypatch.syspath_prepend(str(folder))
    from native_io import read_model
    from selection import MemberSelection

    original = folder.parent / "examples/stat6/inputs/4Y5U.cif"
    model, _ = read_model(original, MemberSelection(chains=("A", "B")))
    converted = tmp_path / "conversion-without-MODRES.pdb"
    writer = PDBIO()
    writer.set_structure(model)
    writer.save(str(converted))
    assert "MODRES" not in converted.read_text()
    parsed, _ = read_model(converted, MemberSelection(chains=("A", "B")))
    assert sum(res.resname == "PTR" for res in parsed.get_residues()) == 2
    with pytest.raises(ValueError, match="must not be silently discarded"):
        selected_polymer(converted, parsed)
