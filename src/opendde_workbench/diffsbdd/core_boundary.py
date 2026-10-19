"""Original heavy-atom cut sites constrain substitutions without rewriting candidates."""

from collections import Counter


def ports(source, fixed_atoms):
    fixed = set(fixed_atoms)
    return {
        index: Counter(
            (str(bond.GetBondType()), bond.GetIsAromatic())
            for bond in source.GetAtomWithIdx(index).GetBonds()
            if bond.GetOtherAtomIdx(index) not in fixed
            and bond.GetOtherAtom(source.GetAtomWithIdx(index)).GetAtomicNum() != 1
        )
        for index in fixed
    }


def assess_attachments(source, candidate, mapping):
    from rdkit import Chem

    allowed = ports(source, mapping)
    output_core = set(mapping.values())
    changes = []
    for original, target in sorted(mapping.items()):
        remaining = allowed[original].copy()
        for bond in candidate.GetAtomWithIdx(target).GetBonds():
            other = bond.GetOtherAtomIdx(target)
            if other in output_core or candidate.GetAtomWithIdx(other).GetAtomicNum() == 1:
                continue
            identity = (str(bond.GetBondType()), bond.GetIsAromatic())
            permitted = remaining[identity] > 0
            if permitted:
                remaining[identity] -= 1
            changes.append(
                {
                    "source_atom": original,
                    "output_atom": target,
                    "added_atom": other,
                    "bond_type": identity[0],
                    "allowed": permitted,
                }
            )
    connected = len(Chem.GetMolFrags(candidate)) == 1
    invalid = [entry for entry in changes if not entry["allowed"]]
    return {
        "source_cut_sites": sorted(index for index, values in allowed.items() if values),
        "checked_attachments": len(changes),
        "unexpected_attachments": invalid,
        "connected": connected,
        "reason": "disconnected_candidate"
        if not connected
        else "unexpected_core_attachment"
        if invalid
        else None,
    }
