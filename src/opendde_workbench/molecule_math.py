"""RDKit descriptors; shared by predictions and independent molecule evaluation."""

from pathlib import Path

from rdkit import Chem
from rdkit.Chem import QED, Crippen, Descriptors, rdMolDescriptors
from rdkit.Contrib.SA_Score import sascorer


def describe(molecule, source: str) -> dict:
    if molecule is None:
        return {
            "input": source,
            "available": False,
            "reason": "RDKit could not parse this molecule.",
        }
    try:
        Chem.SanitizeMol(molecule)
        molecule = Chem.RemoveHs(molecule)
        return {
            "input": source,
            "available": True,
            "smiles": Chem.MolToSmiles(molecule),
            "mw": Descriptors.MolWt(molecule),
            "logp": Crippen.MolLogP(molecule),
            "tpsa": rdMolDescriptors.CalcTPSA(molecule),
            "qed": QED.qed(molecule),
            "sa": sascorer.calculateScore(molecule),
            "hbd": rdMolDescriptors.CalcNumHBD(molecule),
            "hba": rdMolDescriptors.CalcNumHBA(molecule),
            "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(molecule),
        }
    except (ValueError, RuntimeError):
        return {
            "input": source,
            "available": False,
            "reason": "Molecule sanitization or descriptor calculation failed.",
        }


def read_molecules(path: Path):
    if path.suffix == ".sdf":
        yield from Chem.SDMolSupplier(str(path), removeHs=False)
    elif path.suffix == ".mol":
        yield Chem.MolFromMolFile(str(path), removeHs=False)
    elif path.suffix == ".mol2":
        yield Chem.MolFromMol2File(str(path), removeHs=False)
    elif path.suffix == ".pdb":
        yield Chem.MolFromPDBFile(str(path), removeHs=False)
    else:
        raise ValueError("Unsupported molecule file.")


def molecular_properties(entities):
    results = []
    for entity in entities:
        if "ligand" not in entity:
            continue
        source = entity["ligand"]["ligand"]
        if source.startswith("CCD_"):
            results.append(
                {
                    "input": source,
                    "available": False,
                    "reason": "Use a SMILES or molecule file for RDKit descriptors.",
                }
            )
        elif source.startswith("FILE_"):
            # Native input paths refer to the job snapshot mounted in this container.
            path = Path(source.removeprefix("FILE_"))
            if not path.resolve().is_relative_to(Path("/job/assets")):
                raise ValueError("Ligand path is outside the managed input snapshot.")
            results.extend(describe(mol, path.name) for mol in read_molecules(path))
        else:
            results.append(describe(Chem.MolFromSmiles(source), source))
    return results
