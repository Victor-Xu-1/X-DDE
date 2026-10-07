"""Validate capped regions against the exact induced source graph, not H-sensitive queries."""

from rdkit import Chem


def verify_region(full, arm, mapping):
    retained = set(mapping)
    if len(retained) != len(mapping) or len(mapping) != arm.GetNumAtoms():
        raise ValueError("A capped region must preserve distinct original heavy atoms.")
    inverse = {original: local for local, original in enumerate(mapping)}
    for local, original in enumerate(mapping):
        before, after = full.GetAtomWithIdx(original), arm.GetAtomWithIdx(local)
        if (
            before.GetAtomicNum(),
            before.GetFormalCharge(),
            before.GetIsotope(),
            before.GetIsAromatic(),
        ) != (
            after.GetAtomicNum(),
            after.GetFormalCharge(),
            after.GetIsotope(),
            after.GetIsAromatic(),
        ):
            raise ValueError(
                "Capping changed an original element, charge, isotope or aromatic atom."
            )
        missing = [
            bond for bond in before.GetBonds() if bond.GetOtherAtomIdx(original) not in retained
        ]
        if any(bond.GetBondType() != Chem.BondType.SINGLE for bond in missing):
            raise ValueError("Choose a binding-region boundary across ordinary single bonds.")
        if after.GetTotalNumHs() != before.GetTotalNumHs() + len(missing):
            raise ValueError("The fragment cap does not preserve the original valence.")
        if before.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
            if missing:
                raise ValueError("Do not cut directly through a defined stereocenter.")
            first = [a.GetIdx() for a in before.GetNeighbors()]
            second = [mapping[a.GetIdx()] for a in after.GetNeighbors()]
            if set(first) != set(second):
                raise ValueError("The capped stereocenter lost a source neighbor.")
            order = [first.index(i) for i in second]
            inversions = sum(
                order[a] > order[b] for a in range(len(order)) for b in range(a + 1, len(order))
            )
            expected = before.GetChiralTag()
            if inversions % 2:
                expected = (
                    Chem.ChiralType.CHI_TETRAHEDRAL_CCW
                    if expected == Chem.ChiralType.CHI_TETRAHEDRAL_CW
                    else Chem.ChiralType.CHI_TETRAHEDRAL_CW
                )
            if after.GetChiralTag() != expected:
                raise ValueError("Capping changed defined source stereochemistry.")
    expected_bonds = {}
    for bond in full.GetBonds():
        a, b = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if a in retained and b in retained:
            expected_bonds[frozenset((inverse[a], inverse[b]))] = bond
    actual_bonds = {frozenset((b.GetBeginAtomIdx(), b.GetEndAtomIdx())): b for b in arm.GetBonds()}
    if expected_bonds.keys() != actual_bonds.keys():
        raise ValueError("The capped region changed the source-induced covalent graph.")
    for key, before in expected_bonds.items():
        after = actual_bonds[key]
        if (before.GetBondType(), before.GetIsAromatic(), before.GetStereo()) != (
            after.GetBondType(),
            after.GetIsAromatic(),
            after.GetStereo(),
        ):
            raise ValueError("Capping changed source bonds or their defined stereochemistry.")
