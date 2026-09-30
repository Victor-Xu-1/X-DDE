"""Native RDKit boundary, imported only inside the scientific environment."""

import hashlib
import math
from pathlib import Path


def digest(file):
    value = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b""):
            value.update(block)
    return value.hexdigest()


def bound(ref, bindings, suffix, root=Path("/input/assets")):
    value = bindings[str(ref.asset_id)]
    path = root / Path(value).name
    if (
        path.is_symlink()
        or not path.resolve().is_relative_to(root.resolve())
        or path.suffix != suffix
    ):
        raise ValueError("Scientific binding has the wrong type or escapes the input snapshot.")
    if path.stat().st_size > 25 * 1024**2:
        raise ValueError("Input exceeds the native file limit.")
    if digest(path) != ref.sha256:
        raise ValueError("Scientific input digest changed.")
    return path


def molecule(file, record, require_pose=False):
    import numpy as np
    from rdkit import Chem

    supplier = Chem.SDMolSupplier(str(file), removeHs=True)
    if not 0 <= record < len(supplier) or supplier[record] is None:
        raise ValueError("Selected molecular record is missing or chemically invalid.")
    mol = supplier[record]
    if not 1 <= mol.GetNumHeavyAtoms() <= 256 or len(Chem.GetMolFrags(mol)) != 1:
        raise ValueError(
            "This GNINA adapter accepts one connected molecule with 1–256 heavy atoms."
        )
    if any(len(ring) >= 9 for ring in mol.GetRingInfo().AtomRings()):
        raise ValueError("Macrocycles require a separately validated search method.")
    if any(
        atom.GetAtomicNum() not in {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}
        for atom in mol.GetAtoms()
    ):
        raise ValueError(
            "This adapter is not validated for metal-containing or special chemistries."
        )
    if mol.GetNumConformers() != 1 or not np.isfinite(mol.GetConformer().GetPositions()).all():
        raise ValueError("Molecule requires one finite conformer.")
    if require_pose and not mol.GetConformer().Is3D():
        raise ValueError("Use a three-dimensional pose in the confirmed receptor coordinate frame.")
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(atom.GetIdx() + 1)
    return mol


def plain_smiles(mol):
    from rdkit import Chem

    copy = Chem.Mol(mol)
    for atom in copy.GetAtoms():
        atom.SetAtomMapNum(0)
    return Chem.MolToSmiles(copy, isomericSmiles=True)


def score(name, value, unit, direction):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Native score is not finite.")
    return {"name": name, "value": number, "unit": unit, "direction": direction}


def summarize_poses(file, original, options):
    import numpy as np
    from rdkit import Chem

    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Native pose output exceeds its bounded file contract.")
    supplier = Chem.SDMolSupplier(str(file), removeHs=True)
    if not 1 <= len(supplier) <= options.num_modes:
        raise ValueError("Native pose count does not match the requested limit.")
    poses = []
    source_smiles = plain_smiles(original)
    for index, mol in enumerate(supplier):
        row = {"record": index, "valid": False, "scores": [], "mapping_status": "unavailable"}
        try:
            if (
                mol is None
                or plain_smiles(mol) != source_smiles
                or mol.GetNumAtoms() != original.GetNumAtoms()
            ):
                raise ValueError(
                    "Chemical identity or stereochemistry differs from the input state."
                )
            if (
                mol.GetNumConformers() != 1
                or not mol.GetConformer().Is3D()
                or not np.isfinite(mol.GetConformer().GetPositions()).all()
            ):
                raise ValueError("Native pose has invalid coordinates.")
            for field, unit, direction in [
                ("minimizedAffinity", "kcal/mol", "lower"),
                ("CNNscore", "model_output", "higher"),
                ("CNNaffinity", "model_output", "higher"),
            ]:
                if field.startswith("CNN") and options.cnn_scoring == "none":
                    continue
                if mol.HasProp(field):
                    row["scores"].append(score(field, mol.GetProp(field), unit, direction))
            if not any(value["name"] == "minimizedAffinity" for value in row["scores"]):
                raise ValueError("Native pose has no empirical score.")
            mapping = {atom.GetAtomMapNum(): atom.GetIdx() for atom in mol.GetAtoms()}
            mapped_indices = [mapping.get(i + 1, -1) for i in range(original.GetNumAtoms())]
            if set(mapping) == set(
                range(1, original.GetNumAtoms() + 1)
            ) and chemical_mapping_matches(original, mol, mapped_indices):
                row["source_to_pose_atoms"] = [
                    mapping[i + 1] for i in range(original.GetNumAtoms())
                ]
                row["mapping_status"] = "native_atom_maps"
            else:
                matches = mol.GetSubstructMatches(
                    original, uniquify=False, useChirality=True, maxMatches=2
                )
                if len(matches) == 1:
                    row["source_to_pose_atoms"] = list(matches[0])
                    row["mapping_status"] = "unique_graph_match"
                else:
                    row["mapping_status"] = "ambiguous_reconfirm_selections"
            row.update(valid=True, smiles=source_smiles)
        except (ValueError, RuntimeError) as exc:
            row["reason"] = str(exc)
        poses.append(row)
    return poses


def chemical_mapping_matches(original, pose, indices):
    """Native map labels must preserve the actual atom and bond graph before reuse."""
    if (
        len(indices) != original.GetNumAtoms()
        or len(set(indices)) != len(indices)
        or any(index < 0 or index >= pose.GetNumAtoms() for index in indices)
    ):
        return False
    for atom, index in zip(original.GetAtoms(), indices, strict=True):
        mapped = pose.GetAtomWithIdx(index)
        if (atom.GetAtomicNum(), atom.GetFormalCharge(), atom.GetIsotope()) != (
            mapped.GetAtomicNum(),
            mapped.GetFormalCharge(),
            mapped.GetIsotope(),
        ):
            return False
    for bond in original.GetBonds():
        mapped = pose.GetBondBetweenAtoms(
            indices[bond.GetBeginAtomIdx()], indices[bond.GetEndAtomIdx()]
        )
        if mapped is None or mapped.GetBondType() != bond.GetBondType():
            return False
    return True
