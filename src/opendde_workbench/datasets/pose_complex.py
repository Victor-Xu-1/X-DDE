"""A PDB derivative of an actual qualified pose, for the existing native PLIP workflow."""

import string
from pathlib import Path


def export(receptor, molecule, target):
    from rdkit import Chem

    original = [
        line
        for line in Path(receptor).read_text().splitlines()
        if line.startswith(("ATOM  ", "HETATM", "TER   "))
    ]
    atoms = [line for line in original if line.startswith(("ATOM  ", "HETATM"))]
    used = {line[21] for line in atoms}
    chain = next(
        (
            value
            for value in "ZYXWVUTSRQPONMLKJIHGFEDCBA" + string.ascii_lowercase + string.digits
            if value not in used
        ),
        None,
    )
    if chain is None:
        raise ValueError("No unused PDB ligand chain is available for this pose complex.")
    serial = max(int(line[6:11]) for line in atoms)
    if serial + molecule.GetNumAtoms() > 99999:
        raise ValueError("The pose complex exceeds the PDB atom serial capacity.")
    pose = Chem.Mol(molecule)
    element_counts = {}
    for index, atom in enumerate(pose.GetAtoms()):
        symbol = atom.GetSymbol()
        element_counts[symbol] = element_counts.get(symbol, 0) + 1
        info = Chem.AtomPDBResidueInfo()
        info.SetName((symbol + str(element_counts[symbol])).rjust(4))
        info.SetResidueName("LIG")
        info.SetResidueNumber(1)
        info.SetChainId(chain)
        info.SetIsHeteroAtom(True)
        info.SetSerialNumber(index + 1)
        atom.SetMonomerInfo(info)
    generated = Chem.MolToPDBBlock(pose).splitlines()
    derivative = []
    for line in generated:
        if line.startswith(("ATOM  ", "HETATM")):
            derivative.append(line[:6] + f"{serial + int(line[6:11]):5d}" + line[11:])
        elif line.startswith("CONECT"):
            identifiers = [
                int(line[start : start + 5])
                for start in range(6, len(line), 5)
                if line[start : start + 5].strip()
            ]
            derivative.append("CONECT" + "".join(f"{serial + value:5d}" for value in identifiers))
    Path(target).write_text("\n".join(original + derivative + ["END"]) + "\n")
    return {
        "chain": chain,
        "residue": 1,
        "residue_name": "LIG",
        "coordinate_precision_angstrom": 0.001,
    }
