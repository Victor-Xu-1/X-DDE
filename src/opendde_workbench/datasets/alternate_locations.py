"""Choose one explicit residue conformer; never mix different alternate atom labels."""

import math


def choose(scores, policy):
    if not scores:
        return ""
    if policy == "reject" and len(scores) > 1:
        raise ValueError("Confirm an alternate-location policy before using this receptor.")
    if any(not math.isfinite(value) or value < 0 for value in scores.values()):
        raise ValueError("The receptor has invalid alternate-location occupancies.")
    if policy in {"A", "B"}:
        if policy not in scores:
            raise ValueError("The chosen alternate conformer is absent from a residue.")
        return policy
    return min(scores, key=lambda label: (-scores[label], label))


def atoms(residue, policy):
    observed = list(residue.get_atoms())
    scores = {}
    for atom in observed:
        if atom.is_disordered():
            for variant in atom.disordered_get_list():
                label = variant.get_altloc().strip()
                if label:
                    scores[label] = scores.get(label, 0) + (variant.get_occupancy() or 0)
    label = choose(scores, policy)
    result = []
    for atom in observed:
        if not atom.is_disordered():
            result.append(atom)
        else:
            children = atom.child_dict
            if label in children:
                result.append(children[label])
            elif " " in children:
                result.append(children[" "])
            else:
                raise ValueError("A residue lacks a complete consistent alternate conformer.")
    return result, label


def pdb_lines(text, policy):
    scores = {}
    for line in text.splitlines():
        if line.startswith(("ATOM  ", "HETATM")) and line[16:17].strip():
            residue, label = line[21:27], line[16]
            scores.setdefault(residue, {})
            scores[residue][label] = scores[residue].get(label, 0) + float(line[54:60].strip() or 0)
    selected = {residue: choose(values, policy) for residue, values in scores.items()}
    lines = [
        line
        for line in text.splitlines()
        if not line.startswith(("ATOM  ", "HETATM"))
        or not line[16:17].strip()
        or selected[line[21:27]] == line[16]
    ]
    return lines, selected
