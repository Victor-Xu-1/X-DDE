"""Native scientific counterexamples executed only inside the reviewed RDKit container."""

import json
import sys
from pathlib import Path

import numpy as np
from cluster_contacts import ProteinGeometry, contact_similarity, contacts, verify_aligned_frame
from cluster_geometry import MolecularGeometry, fixed_frame_rmsd, read_pose
from rdkit import Chem, rdBase


def geometry(molecule, xyz):
    mol = Chem.Mol(molecule)
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(0)
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    return MolecularGeometry(
        mol,
        np.asarray(xyz, dtype=float),
        tuple(a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1),
        Chem.MolToSmiles(mol, isomericSmiles=True),
    )


def main():
    source = read_pose(Path(sys.argv[1]))
    assert len(source.heavy_indices) >= 25, "Use the actual BRD4/JQ1 drug-like molecule"
    # Identical graph with permuted atom order must remain identical in this frame.
    order = list(reversed(range(source.molecule.GetNumAtoms())))
    permuted = geometry(Chem.RenumberAtoms(source.molecule, order), source.coordinates[order])
    zero, status, _ = fixed_frame_rmsd(source, permuted, 1000)
    assert zero < 1e-10 and status == "complete_stereo_preserving_symmetry"
    shifted = geometry(source.molecule, source.coordinates + np.asarray([10, 0, 0]))
    moved, _, _ = fixed_frame_rmsd(source, shifted, 1000)
    assert moved > 5, "Ligand fitting must never erase a pose displacement"
    # A common proper rigid motion of both complexes must preserve their difference.
    angle = 0.71
    rotation = np.asarray(
        [[np.cos(angle), -np.sin(angle), 0], [np.sin(angle), np.cos(angle), 0], [0, 0, 1]]
    )
    a = geometry(source.molecule, source.coordinates @ rotation + [13, 8, -2])
    b = geometry(shifted.molecule, shifted.coordinates @ rotation + [13, 8, -2])
    rotated, _, _ = fixed_frame_rmsd(a, b, 1000)
    assert abs(rotated - moved) < 1e-10
    first = geometry(Chem.MolFromSmiles("N[C@H](C)C(=O)O"), np.arange(18).reshape(6, 3))
    other = geometry(Chem.MolFromSmiles("N[C@@H](C)C(=O)O"), first.coordinates)
    assert fixed_frame_rmsd(first, other, 1000)[:2] == (None, "different_chemical_graph")
    ring = geometry(Chem.MolFromSmiles("c1ccccc1"), np.arange(18).reshape(6, 3))
    assert fixed_frame_rmsd(ring, ring, 1)[:2] == (None, "symmetry_map_budget_exhausted")
    missing = (frozenset(), None, [])
    assert contact_similarity(missing, missing, 0.7) == (None, "no_mapped_contacts")
    residue = ("A", 1, "")
    mappings = [
        {
            "reference": {"chain": "R", "number": 10, "insertion_code": ""},
            "moving": {"chain": "A", "number": 1, "insertion_code": ""},
        }
    ]
    protein = ProteinGeometry(
        np.asarray([source.coordinates[0] + [1, 0, 0]]), (residue,), {residue: (0, 0, 0)}
    )
    fingerprint = contacts(source, protein, mappings, 4.5)
    assert fingerprint[0] == frozenset({("R", 10, "")}) and fingerprint[1] == 1
    transformed = ProteinGeometry(
        protein.coordinates @ rotation + [13, 8, -2], protein.residues, protein.ca
    )
    rotated_contacts = contacts(a, transformed, mappings, 4.5)
    assert fingerprint[0] == rotated_contacts[0]
    assert (
        abs(fingerprint[2][0]["distance_angstrom"] - rotated_contacts[2][0]["distance_angstrom"])
        < 1e-10
    )
    # Coordinate-frame validation rejects applying the alignment twice.
    ca = {("A", i, ""): (float(i), float(i % 2), 0) for i in (1, 2, 3)}
    anchors = [
        {"moving": {"chain": "A", "number": i}, "reference": {"chain": "A", "number": i}}
        for i in (1, 2, 3)
    ]
    receptor = ProteinGeometry(np.zeros((0, 3)), (), ca)
    assert verify_aligned_frame(receptor, receptor, anchors, 0) == 0
    moved_receptor = ProteinGeometry(
        np.zeros((0, 3)), (), {k: tuple(np.asarray(v) + 10) for k, v in ca.items()}
    )
    try:
        verify_aligned_frame(moved_receptor, receptor, anchors, 0)
    except ValueError:
        pass
    else:
        raise AssertionError("A moved/double-transformed receptor must fail its frozen frame check")
    Path(sys.argv[2]).write_text(
        json.dumps(
            {
                "rdkit": rdBase.rdkitVersion,
                "numpy": np.__version__,
                "public_drug_heavy_atoms": len(source.heavy_indices),
                "permuted_rmsd": zero,
                "ligand_only_shift_rmsd": moved,
                "common_rigid_motion_difference": abs(rotated - moved),
                "opposite_stereo_separate": True,
                "symmetry_budget_unknown": True,
                "empty_contacts_unknown": True,
                "renumbered_residue_contacts": True,
                "coordinate_frame_mismatch_rejected": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
