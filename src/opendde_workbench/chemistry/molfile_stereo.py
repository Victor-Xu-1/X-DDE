"""Retain source stereo uncertainty when coordinates are written to molecular files."""


def source_stereo_molecule(molecule):
    """Return an export copy with unknown stereo explicit and a strict readback guard.

    A 3D Molfile reader otherwise infers tetrahedral/alkene stereochemistry from
    coordinates. Wavy single bonds and crossed double bonds express the source's
    uncertainty without moving atoms, removing stereochemistry or changing IDs.
    """
    from rdkit import Chem

    expected = Chem.MolToSmiles(molecule, isomericSmiles=True)
    exported = Chem.Mol(molecule)
    potential = Chem.FindPotentialStereo(exported)
    for item in potential:
        if item.specified == Chem.StereoSpecified.Specified:
            continue
        if item.type == Chem.StereoType.Bond_Double:
            exported.GetBondWithIdx(item.centeredOn).SetStereo(Chem.BondStereo.STEREOANY)
        elif item.type == Chem.StereoType.Atom_Tetrahedral:
            atom = exported.GetAtomWithIdx(item.centeredOn)
            candidates = [
                bond
                for bond in atom.GetBonds()
                if bond.GetBeginAtomIdx() == item.centeredOn
                and bond.GetBondType() == Chem.BondType.SINGLE
                and bond.GetBondDir() in {Chem.BondDir.NONE, Chem.BondDir.UNKNOWN}
            ]
            if not candidates:
                raise ValueError(
                    "Source stereo uncertainty cannot be retained in this molecular file; "
                    "prepare explicitly specified stereoisomers first."
                )
            # Prefer an unassigned neighbour; the final readback also protects
            # every already specified centre, double bond, isotope and charge.
            candidates.sort(
                key=lambda bond: (
                    bond.GetEndAtom().GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED,
                    bond.GetIdx(),
                )
            )
            atom.SetChiralTag(Chem.ChiralType.CHI_UNSPECIFIED)
            candidates[0].SetBondDir(Chem.BondDir.UNKNOWN)
    parsed = Chem.MolFromMolBlock(Chem.MolToMolBlock(exported), removeHs=False)
    if parsed is None or Chem.MolToSmiles(parsed, isomericSmiles=True) != expected:
        raise ValueError(
            "Molecular file readback changed source identity or stereo specification; "
            "the source is retained and this export was rejected."
        )
    return exported
