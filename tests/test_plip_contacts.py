"""Native result-schema and source-frame controls; these do not infer chemical contacts."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace as Item

import pytest


def module(name):
    file = Path(__file__).parents[1] / "src/opendde_workbench/integrations" / (name + ".py")
    spec = importlib.util.spec_from_file_location("contact_contract_" + name, file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def profile(**selected):
    fields = (
        "hydrophobic_contacts",
        "hbonds_pdon",
        "hbonds_ldon",
        "pistacking",
        "saltbridge_pneg",
        "saltbridge_lneg",
        "pication_laro",
        "pication_paro",
        "halogen_bonds",
        "water_bridges",
        "metal_complexes",
    )
    return Item(**{name: selected.get(name, []) for name in fields})


@pytest.fixture
def source(tmp_path):
    points = ((1, 2, 3), (1, 2, 5), (4, 2, 3), (4, 2, 5), (8, 9, 10), (2, 3, 4), (3, 2, 3))
    residues = (("ASN", "A", 33),) * 2 + (("LIG", "Z", 1),) * 3 + (("HOH", "W", 1), ("ZN", "Z", 2))
    file = tmp_path / "source.pdb"
    lines = []
    for index, (point, (residue, chain, number)) in enumerate(zip(points, residues, strict=True)):
        record = "ATOM  " if index < 2 else "HETATM"
        lines.append(
            f"{record}{101 + 101 * index:5d} {('C' + str(index + 1)):>4s} "
            f"{residue:3s} {chain}{number:4d}    "
            f"{point[0]:8.3f}{point[1]:8.3f}{point[2]:8.3f}  1.00 20.00           C  "
        )
    file.write_text("\n".join(lines) + "\n")
    return module("plip_coordinates").SourceCoordinates(file, "Z", 1), [
        Item(coords=p) for p in points
    ]


def contact(**fields):
    return Item(reschain="A", resnr=33, restype="ASN", **fields)


@pytest.mark.parametrize(
    "kind", ["hydrophobic", "protein_donor", "ligand_donor", "halogen", "water", "metal"]
)
def test_native_atomic_wrappers_retain_original_endpoints_and_direction(source, kind):
    original, (protein, _, ligand, _, _, water, metal) = source
    field, expected, item = {
        "hydrophobic": (
            "hydrophobic_contacts",
            "hydrophobic",
            contact(bsatom=protein, ligatom=ligand),
        ),
        "protein_donor": ("hbonds_pdon", "hydrogen_bond", contact(d=protein, a=ligand)),
        "ligand_donor": ("hbonds_ldon", "hydrogen_bond", contact(a=protein, d=ligand)),
        "halogen": (
            "halogen_bonds",
            "halogen_bond",
            contact(acc=Item(o=protein), don=Item(x=ligand)),
        ),
        "water": (
            "water_bridges",
            "water_bridge",
            contact(d=protein, a=ligand, water=water, protisdon=True),
        ),
        "metal": (
            "metal_complexes",
            "metal_complex",
            contact(target=Item(atom=protein), metal=metal, location="protein.sidechain"),
        ),
    }[kind]
    result = module("plip_contacts").profile_contacts(profile(**{field: [item]}), original)
    assert len(result) == 1 and result[0]["kind"] == expected
    assert result[0]["protein_position"] == [1, 2, 3]
    assert result[0]["ligand_position"] == ([3, 2, 3] if kind == "metal" else [4, 2, 3])
    assert result[0]["distance"] == (2 if kind == "metal" else 3)
    if kind == "water":
        assert result[0]["bridge_position"] == [2, 3, 4]


@pytest.mark.parametrize(
    "kind", ["pistacking", "saltbridge_pneg", "saltbridge_lneg", "pication_laro", "pication_paro"]
)
def test_ring_and_charge_centers_are_verified_against_the_correct_original_groups(source, kind):
    original, atoms = source
    protein = Item(atoms=atoms[:2], center=(1, 2, 4))
    ligand = Item(atoms=atoms[2:4], center=(4, 2, 4), fgroup="carboxylate")
    fields = {
        "pistacking": {"proteinring": protein, "ligandring": ligand},
        "saltbridge_pneg": {"negative": protein, "positive": ligand},
        "saltbridge_lneg": {"positive": protein, "negative": ligand},
        "pication_laro": {"charge": protein, "ring": ligand},
        "pication_paro": {"ring": protein, "charge": ligand},
    }[kind]
    result = module("plip_contacts").profile_contacts(
        profile(**{kind: [contact(**fields)]}), original
    )
    assert result[0]["protein_position"] == [1, 2, 4]
    assert result[0]["ligand_position"] == [4, 2, 4]
    ligand.center = (4.25, 2, 4)
    with pytest.raises(ValueError, match="center differs"):
        module("plip_contacts").profile_contacts(profile(**{kind: [contact(**fields)]}), original)


def test_declared_atomic_charge_center_is_not_replaced_with_a_group_centroid(source):
    original, atoms = source
    group = Item(atoms=atoms[2:4], center=atoms[4].coords, fgroup="guanidine")
    assert module("plip_contacts").charge_center(group, original, ligand=True) == [8, 9, 10]
    group.center = (8.1, 9, 10)
    with pytest.raises(ValueError, match="source frame or residue"):
        module("plip_contacts").charge_center(group, original, ligand=True)


def test_receptor_modified_group_needs_native_classification_at_the_exact_source_center(source):
    original, atoms = source
    group = Item(atoms=atoms[:2], center=atoms[0].coords)
    detector = Item(is_functional_group=lambda atom, kind: atom is atoms[0] and kind == "phosphate")
    assert module("plip_contacts").charge_center(
        group, original, protein=("A", 33, "ASN"), detector=detector, centers=[atoms[0]]
    ) == [1, 2, 3]
    for refused in (None, Item(is_functional_group=lambda atom, kind: False)):
        with pytest.raises(ValueError, match="center differs"):
            module("plip_contacts").charge_center(
                group, original, protein=("A", 33, "ASN"), detector=refused, centers=[atoms[0]]
            )
    group.center = (1.01, 2, 3)
    with pytest.raises(ValueError, match="center differs"):
        module("plip_contacts").charge_center(
            group, original, protein=("A", 33, "ASN"), detector=detector, centers=[atoms[0]]
        )


def test_contact_cannot_point_to_a_different_residue_or_swap_protein_and_ligand(source):
    original, atoms = source
    for item in (
        contact(acc=Item(o=atoms[2]), don=Item(x=atoms[0])),
        Item(reschain="B", resnr=33, restype="ASN", acc=Item(o=atoms[0]), don=Item(x=atoms[2])),
    ):
        with pytest.raises(ValueError, match="source frame or residue"):
            module("plip_contacts").profile_contacts(profile(halogen_bonds=[item]), original)


@pytest.mark.parametrize("center", [(1, 2), (float("nan"), 2, 3), (float("inf"), 2, 3)])
def test_invalid_centers_fail_without_inventing_replacement_coordinates(source, center):
    original, atoms = source
    with pytest.raises(ValueError):
        original.group(atoms[:2], center, protein=("A", 33, "ASN"))
