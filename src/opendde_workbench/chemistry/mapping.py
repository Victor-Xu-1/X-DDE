"""Atom properties carry identity without introducing bookkeeping-based chirality."""

SOURCE = "_XDDESourceAtomIndex"
ALLOWED = {5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}


def normalize(mol):
    from rdkit import Chem

    copy = Chem.Mol(mol)
    copy.RemoveAllConformers()
    for atom in copy.GetAtoms():
        atom.SetAtomMapNum(0)
    Chem.AssignStereochemistry(copy, cleanIt=True, force=True)
    return copy


def source_molecule(mol):
    from rdkit import Chem

    mol = normalize(Chem.RemoveHs(mol))
    if not 1 <= mol.GetNumAtoms() <= 128 or len(Chem.GetMolFrags(mol)) != 1:
        raise ValueError("Choose one connected molecular component with 1 to 128 heavy atoms.")
    if any(a.GetAtomicNum() not in ALLOWED or a.GetNumRadicalElectrons() for a in mol.GetAtoms()):
        raise ValueError(
            "This state-preparation method does not support metals, radicals or dummy atoms."
        )
    for atom in mol.GetAtoms():
        atom.SetIntProp(SOURCE, atom.GetIdx())
    return mol


def correspondence(source, variant):
    if variant.GetNumAtoms() != source.GetNumAtoms() or any(
        not a.HasProp(SOURCE) for a in variant.GetAtoms()
    ):
        raise ValueError("State preparation lost the source atom identities.")
    mapping = [None] * source.GetNumAtoms()
    for atom in variant.GetAtoms():
        index = atom.GetIntProp(SOURCE)
        if not 0 <= index < len(mapping) or mapping[index] is not None:
            raise ValueError("State atom correspondence is not one-to-one.")
        original = source.GetAtomWithIdx(index)
        if (atom.GetAtomicNum(), atom.GetIsotope()) != (
            original.GetAtomicNum(),
            original.GetIsotope(),
        ):
            raise ValueError("State preparation changed elemental/isotopic identity.")
        mapping[index] = atom.GetIdx()
    edges = {
        tuple(sorted((mapping[b.GetBeginAtomIdx()], mapping[b.GetEndAtomIdx()])))
        for b in source.GetBonds()
    }
    actual = {tuple(sorted((b.GetBeginAtomIdx(), b.GetEndAtomIdx()))) for b in variant.GetBonds()}
    if edges != actual:
        raise ValueError("State preparation changed heavy-atom connectivity.")
    return mapping


def labelled_smiles(mol):
    from rdkit import Chem

    copy = Chem.Mol(mol)
    for atom in copy.GetAtoms():
        atom.SetAtomMapNum(atom.GetIntProp(SOURCE) + 1)
    return Chem.MolToSmiles(copy, isomericSmiles=True)


def restore_labels(smiles, source):
    from rdkit import Chem

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("Protonation returned an invalid chemical structure.")
    for atom in mol.GetAtoms():
        if atom.GetAtomMapNum() <= 0:
            raise ValueError("Protonation did not retain explicit source atom labels.")
        atom.SetIntProp(SOURCE, atom.GetAtomMapNum() - 1)
    mol = normalize(mol)
    correspondence(source, mol)
    return mol


def stereo_preserved(source, variant, mapping):
    """Compare defined configurations through original identities, not changing CIP ranks."""
    from rdkit import Chem

    tetra = {Chem.ChiralType.CHI_TETRAHEDRAL_CW: 1, Chem.ChiralType.CHI_TETRAHEDRAL_CCW: -1}
    inverse = {target: original for original, target in enumerate(mapping)}
    for original in source.GetAtoms():
        tag = original.GetChiralTag()
        if tag == Chem.ChiralType.CHI_UNSPECIFIED:
            continue
        target = variant.GetAtomWithIdx(mapping[original.GetIdx()])
        if tag not in tetra or target.GetChiralTag() not in tetra:
            return False
        first = [a.GetIdx() for a in original.GetNeighbors()]
        second = [inverse[a.GetIdx()] for a in target.GetNeighbors()]
        order = [first.index(i) for i in second]
        inversions = sum(
            order[i] > order[j] for i in range(len(order)) for j in range(i + 1, len(order))
        )
        if tetra[tag] != tetra[target.GetChiralTag()] * (-1 if inversions % 2 else 1):
            return False
    signs = {
        Chem.BondStereo.STEREOE: 1,
        Chem.BondStereo.STEREOTRANS: 1,
        Chem.BondStereo.STEREOZ: -1,
        Chem.BondStereo.STEREOCIS: -1,
    }
    for bond in source.GetBonds():
        if bond.GetStereo() in {Chem.BondStereo.STEREONONE, Chem.BondStereo.STEREOANY}:
            continue
        target = variant.GetBondBetweenAtoms(
            mapping[bond.GetBeginAtomIdx()], mapping[bond.GetEndAtomIdx()]
        )
        if bond.GetStereo() not in signs or target.GetStereo() not in signs:
            return False
        first = list(bond.GetStereoAtoms())
        second = [inverse[i] for i in target.GetStereoAtoms()]
        if inverse[target.GetBeginAtomIdx()] != bond.GetBeginAtomIdx():
            second.reverse()
        if len(first) != 2 or len(second) != 2:
            return False
        switches = sum(a != b for a, b in zip(first, second, strict=True))
        if signs[bond.GetStereo()] != signs[target.GetStereo()] * (-1 if switches % 2 else 1):
            return False
    return True
