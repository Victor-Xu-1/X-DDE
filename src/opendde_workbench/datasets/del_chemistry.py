"""Explicit derived off-DNA capping; supplied chemistry is never silently overwritten."""


def candidate_molecule(smiles, policy):
    from rdkit import Chem

    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        raise ValueError("invalid_resolved_member_structure")
    attachments = [atom for atom in molecule.GetAtoms() if atom.GetAtomicNum() == 0]
    if attachments and policy == "retain":
        raise ValueError("DNA_attachment_retained; choose_explicit_hydrogen_capping_for_3D")
    if attachments:
        for atom in attachments:
            if atom.GetDegree() != 1 or atom.GetBonds()[0].GetBondType() != Chem.BondType.SINGLE:
                raise ValueError(
                    "attachment_is_not_a_terminal_single_bond; review_off_DNA_structure"
                )
            atom.SetAtomicNum(1)
            atom.SetFormalCharge(0)
            atom.SetIsotope(0)
            atom.SetAtomMapNum(0)
            atom.SetNoImplicit(True)
        Chem.SanitizeMol(molecule)
        molecule = Chem.RemoveHs(molecule)
        Chem.AssignStereochemistry(molecule, cleanIt=True, force=True)
    return molecule
