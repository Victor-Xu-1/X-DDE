"""Validate library/query snapshot bytes; preserve original record numbering and coordinates."""

import hashlib


def read_sdf(ref, bindings, directory):
    from rdkit import Chem

    binding = bindings[str(ref["asset_id"])]
    if not isinstance(binding, str) or not binding.startswith("/job/assets/"):
        raise ValueError("Library input binding escapes its managed snapshot.")
    root = directory / "assets"
    file = directory / binding.removeprefix("/job/")
    if (
        file.is_symlink()
        or not file.resolve().is_relative_to(root.resolve())
        or file.suffix != ".sdf"
        or file.stat().st_size > 25 * 1024**2
    ):
        raise ValueError("Choose a bounded SDF file from the actual task snapshot.")
    if hashlib.sha256(file.read_bytes()).hexdigest() != ref["sha256"]:
        raise ValueError("Library/query bytes differ from the selected input digest.")
    supplier = Chem.SDMolSupplier(str(file), removeHs=False)
    if not 1 <= len(supplier) <= 500:
        raise ValueError("Split the library into files of one to 500 records before screening.")
    return supplier


def valid_molecule(molecule):
    from rdkit import Chem

    if molecule is None:
        raise ValueError("Record could not be parsed/sanitized by RDKit.")
    if not 1 <= molecule.GetNumHeavyAtoms() <= 256:
        raise ValueError("Early library selection accepts 1 to 256 heavy atoms per record.")
    if any(
        atom.GetAtomicNum() == 0 or atom.GetNumRadicalElectrons() for atom in molecule.GetAtoms()
    ):
        raise ValueError("Dummy atoms and radicals require a different explicit method.")
    comparison = Chem.RemoveHs(Chem.Mol(molecule))
    for atom in comparison.GetAtoms():
        atom.SetAtomMapNum(0)
    return comparison
