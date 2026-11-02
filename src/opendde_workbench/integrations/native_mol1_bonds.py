"""Translate original file atom identities to the pinned parser's actual atom names."""

import math
from pathlib import Path


def chemical_identity(atom):
    return atom.GetAtomicNum(), atom.GetIsotope(), atom.GetFormalCharge(), atom.GetChiralTag()


def chemical_bonds(molecule):
    return {
        (
            min(b.GetBeginAtomIdx(), b.GetEndAtomIdx()),
            max(b.GetBeginAtomIdx(), b.GetEndAtomIdx()),
            str(b.GetBondType()),
        )
        for b in molecule.GetBonds()
    }


def file_atom_names(file):
    from mol.data.inference.json_parser import lig_file_to_atom_info
    from rdkit import Chem

    loaders = {
        ".sdf": lambda: next(Chem.SDMolSupplier(str(file), removeHs=False)),
        ".mol": lambda: Chem.MolFromMolFile(str(file), removeHs=False),
        ".pdb": lambda: Chem.MolFromPDBFile(str(file), removeHs=False),
        ".mol2": lambda: Chem.MolFromMol2File(str(file), removeHs=False),
    }
    original = loaders[file.suffix]()
    if original is None or not original.GetNumConformers() or not original.GetConformer().Is3D():
        raise ValueError("Covalent file endpoints require their exact original 3D molecule.")
    for atom in original.GetAtoms():
        atom.SetIntProp("_xdde_original_index", atom.GetIdx())
    reduced = Chem.RemoveHs(original)
    native = lig_file_to_atom_info(str(file))["mol"]
    if reduced.GetNumAtoms() != native.GetNumAtoms():
        raise ValueError("Native hydrogen removal changed the ligand atom correspondence.")
    mapping = {}
    for atom, target in zip(reduced.GetAtoms(), native.GetAtoms(), strict=True):
        if (
            chemical_identity(atom) != chemical_identity(target)
            or atom.GetAtomMapNum() != target.GetAtomMapNum()
        ):
            raise ValueError("Native ligand parsing changed an original atom's chemical identity.")
        index = atom.GetIntProp("_xdde_original_index")
        first = original.GetConformer().GetAtomPosition(index)
        second = native.GetConformer().GetAtomPosition(target.GetIdx())
        if math.dist(tuple(first), tuple(second)) > 0.00001:
            raise ValueError("Native ligand parsing changed original coordinates or atom order.")
        if atom.GetAtomicNum() != 1:
            mapping[index] = target.GetProp("name")
    if chemical_bonds(reduced) != chemical_bonds(native):
        raise ValueError("Native parsing changed the original ligand chemical graph.")
    return mapping


def translate_file_endpoints(request, document):
    mappings, receipt = {}, []
    for bond in document[0].get("covalent_bonds", []):
        for side in (1, 2):
            entity = int(bond[f"entity{side}"])
            component = request["payload"]["components"][entity - 1]
            if not component.get("ligand_file"):
                if component["kind"] == "ligand" and not component["value"].startswith("CCD_"):
                    from rdkit import Chem

                    molecule = Chem.MolFromSmiles(component["value"])
                    endpoint = bond[f"atom{side}"]
                    atoms = (
                        []
                        if molecule is None
                        else [
                            a
                            for a in molecule.GetAtoms()
                            if a.GetAtomMapNum() == endpoint and a.GetAtomicNum() != 1
                        ]
                    )
                    if not isinstance(endpoint, int) or endpoint <= 0 or len(atoms) != 1:
                        raise ValueError(
                            "A SMILES covalent endpoint must name "
                            "one explicit unique heavy-atom map."
                        )
                continue
            endpoint = bond[f"atom{side}"]
            if not isinstance(endpoint, int):
                raise ValueError("File-ligand covalent endpoints require original atom indices.")
            if entity not in mappings:
                native = document[0]["sequences"][entity - 1]["ligand"]["ligand"]
                file = Path(native.removeprefix("FILE_"))
                if (
                    not native.startswith("FILE_")
                    or file.parent != Path("/input/assets")
                    or file.stem != str(component["ligand_file"])
                ):
                    raise ValueError("Native ligand input does not belong to the task snapshot.")
                mappings[entity] = file_atom_names(file)
            atom_name = mappings[entity].get(endpoint)
            if not atom_name:
                raise ValueError(
                    "Select an original heavy atom retained by the native ligand parser."
                )
            # A nonnumeric atom name bypasses upstream atom-map-number lookup entirely.
            bond[f"atom{side}"] = atom_name
            receipt.append(
                {"entity": entity, "original_atom_index": endpoint, "native_atom_name": atom_name}
            )
    return receipt
