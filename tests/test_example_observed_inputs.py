"""Observed-coordinate template projections, never model inference or invented outputs."""

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples import preparation
from opendde_workbench.examples.structure_inputs import observed_alt_a_pdb
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def atom(serial, alternate, x, record="HETATM"):
    return (
        f"{record:<6}{serial:5d} {'C1':<4}{alternate}LIG A   1    "
        f"{x:8.3f}{0.0:8.3f}{0.0:8.3f}  1.00 20.00           C\n"
    ).encode()


def test_explicit_alternate_projection_preserves_observed_coordinates_and_bonds():
    a, blank, b = atom(1, "A", 12.5), atom(2, " ", 4.25), atom(3, "B", -7.5)
    source = a + blank + b + b"CONECT    1    2    3\nCONECT    3    1\nEND\n"
    result = observed_alt_a_pdb(source)
    kept = [line for line in result.splitlines() if line.startswith(b"HETATM")]
    assert len(kept) == 2
    assert kept[0][:16] == a[:16] and kept[0][16:17] == b" "
    assert kept[0][17:] == a.rstrip(b"\n")[17:]
    assert kept[1] == blank.rstrip(b"\n")
    assert b"CONECT    1    2\n" in result and b"CONECT    3" not in result
    assert b in source, "The original input must remain intact"


def test_empty_alternate_projection_is_rejected():
    with pytest.raises(ValueError, match="no observed atoms"):
        observed_alt_a_pdb(atom(1, "B", 12.5))


@pytest.mark.parametrize(
    "capability,key",
    [
        ("biopython.exposure", "brd4_alt_a"),
        ("apbs.potential", "protein_only"),
        ("openmm.refine", "protein_only"),
    ],
)
def test_projected_public_inputs_retain_parent_and_repeat_without_duplicate_versions(
    tmp_path, monkeypatch, capability, key
):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    scientific = ScientificStore(store, assets)
    source = atom(1, "A", 12.5, "ATOM") + atom(2, "B", -7.5, "ATOM") + atom(3, " ", 4.25) + b"END\n"
    monkeypatch.setattr(
        preparation,
        "verified_file",
        lambda _, spec: source if spec.key.startswith("brd4") else b"public ligand\nM  END\n$$$$\n",
    )
    first = preparation.prepare_example(capability, scientific, tmp_path / "cache")
    repeated = preparation.prepare_example(capability, scientific, tmp_path / "cache")
    projected = first.objects[key]
    assert projected.reference == repeated.objects[key].reference
    assert projected.parent_id == first.objects["brd4"].id
    assert projected.relation == "prepared_from"
    original = assets.path(assets.get(first.objects["brd4"].reference.asset_id)).read_bytes()
    assert original == source
    content = assets.path(assets.get(projected.reference.asset_id)).read_bytes()
    assert all(
        line[16:17] == b" "
        for line in content.splitlines()
        if line.startswith((b"ATOM", b"HETATM"))
    )
    if key == "protein_only":
        assert b"HETATM" not in content
