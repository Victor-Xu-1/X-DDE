"""The retained molecular record must match its declared candidate chemistry."""

from docking_chemistry import molecule, plain_smiles


def candidate_molecule(root, candidate):
    from rdkit import Chem

    source = molecule(root / candidate["artifact"], candidate.get("record", 0))
    declared = Chem.MolFromSmiles(candidate.get("smiles", ""))
    if declared is None or plain_smiles(source) != plain_smiles(declared):
        raise ValueError(
            "The stored candidate structure differs from its recorded chemical identity "
            "or stereo. Prepare a verified molecule version first."
        )
    return source
