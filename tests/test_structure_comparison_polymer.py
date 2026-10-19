"""The real phosphorylated source must survive selection, adaptation and mmCIF export."""

import hashlib
from pathlib import Path


def test_deposited_phosphotyrosine_atoms_and_polymer_annotations_roundtrip(tmp_path, monkeypatch):
    from opendde_workbench.structure_comparison.native_export import write_compared_model
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
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_sha
