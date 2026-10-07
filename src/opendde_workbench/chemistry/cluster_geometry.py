"""Native stereochemistry-aware symmetry RMSD in the unchanged receptor frame."""

from dataclasses import dataclass


@dataclass
class MolecularGeometry:
    molecule: object
    coordinates: object
    heavy_indices: tuple[int, ...]
    identity: str


def read_pose(file):
    import numpy as np
    from rdkit import Chem
    from sdf_io import read_records

    records = read_records(file.read_bytes())
    if len(records) != 1 or records[0] is None:
        raise ValueError("A native pose must contain exactly one chemically valid SDF record.")
    mol = Chem.RemoveHs(records[0])
    if not 2 <= mol.GetNumHeavyAtoms() <= 500 or mol.GetNumAtoms() > 2048:
        raise ValueError("Pose clustering supports 2–500 heavy atoms within its atom budget.")
    if len(Chem.GetMolFrags(mol)) != 1 or any(
        a.GetAtomicNum() == 0 or a.GetNumRadicalElectrons() for a in mol.GetAtoms()
    ):
        raise ValueError("Choose connected, resolved molecules without dummy atoms or radicals.")
    if any(g.GetGroupType() != Chem.StereoGroupType.STEREO_ABSOLUTE for g in mol.GetStereoGroups()):
        raise ValueError("Resolve relative/mixture stereochemistry before comparing poses.")
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(0)
    Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    if mol.GetNumConformers() != 1 or not mol.GetConformer().Is3D():
        raise ValueError("Pose comparison requires an existing three-dimensional conformer.")
    xyz = mol.GetConformer().GetPositions()
    if not np.isfinite(xyz).all() or np.abs(xyz).max() > 100000:
        raise ValueError("Pose coordinates are invalid or exceed the supported coordinate range.")
    identity = Chem.MolToSmiles(mol, isomericSmiles=True)
    if len(identity) > 20000:
        raise ValueError("Chemical identity exceeds its result budget.")
    return MolecularGeometry(
        mol,
        xyz,
        tuple(atom.GetIdx() for atom in mol.GetAtoms() if atom.GetAtomicNum() > 1),
        identity,
    )


def fixed_frame_rmsd(left, right, maximum_maps):
    import numpy as np

    if left.identity != right.identity:
        return None, "different_chemical_graph", 0
    if left.molecule.GetNumAtoms() != right.molecule.GetNumAtoms():
        raise ValueError("Equal chemical identity must retain the same mapped atom graph.")
    # maxMatches + 1 detects incomplete symmetry enumeration. Never report the
    # minimum of a truncated list as a fully symmetry-corrected distance.
    matches = right.molecule.GetSubstructMatches(
        left.molecule, uniquify=False, useChirality=True, maxMatches=maximum_maps + 1
    )
    if len(matches) > maximum_maps:
        return None, "symmetry_map_budget_exhausted", len(matches)
    if not matches:
        return None, "atom_mapping_unavailable", 0
    indices = np.asarray(left.heavy_indices, dtype=int)
    mapped = np.asarray(matches, dtype=int)[:, indices]
    difference = right.coordinates[mapped] - left.coordinates[indices][None, :, :]
    rmsd = float(np.sqrt(np.min(np.mean(np.sum(difference * difference, axis=2), axis=1))))
    return rmsd, "complete_stereo_preserving_symmetry", len(matches)
