"""Bounded independent core verification using actual heavy atoms and coordinates.

This runs only inside the managed RDKit environment. It does not trust output atom
order, upstream validity flags, or absolute CIP labels after substituent changes.
"""

import math

from stereo import chemical_stereo, stereo_status

METHOD = "rdkit_fixed_core_v1"
TOLERANCE = 0.5  # The frozen native inpainting coordinate contract, in angstrom.
SEARCH_LIMIT = 10000


def coordinates(mol):
    if mol is None or not 1 <= mol.GetNumAtoms() <= 5000:
        raise ValueError("Core verification requires a parsed, bounded molecule.")
    if mol.GetNumConformers() != 1 or not mol.GetConformer().Is3D():
        raise ValueError("Core verification requires one three-dimensional conformer.")
    points = [tuple(mol.GetConformer().GetAtomPosition(i)) for i in range(mol.GetNumAtoms())]
    if not all(math.isfinite(v) for point in points for v in point):
        raise ValueError("Core verification requires finite coordinates.")
    return points


def atom_identity(atom):
    return atom.GetAtomicNum(), atom.GetIsotope(), atom.GetFormalCharge()


def bond_identity(mol, left, right):
    bond = mol.GetBondBetweenAtoms(left, right)
    return None if bond is None else (str(bond.GetBondType()), bond.GetIsAromatic())


def assess(source, candidate, fixed_atoms, preserve_bonds=True, *, search_limit=SEARCH_LIMIT):
    source, candidate = chemical_stereo(source), chemical_stereo(candidate)
    points, output_points = coordinates(source), coordinates(candidate)
    fixed = tuple(fixed_atoms)
    if (
        not fixed
        or len(set(fixed)) != len(fixed)
        or len(fixed) > 80
        or any(i < 0 or i >= len(points) for i in fixed)
    ):
        raise ValueError("Fixed atoms must belong to the exact source heavy-atom record.")
    if not 1 <= search_limit <= SEARCH_LIMIT:
        raise ValueError("Core mapping search must have a bounded budget.")
    choices = {
        i: [
            j
            for j, p in enumerate(output_points)
            if atom_identity(source.GetAtomWithIdx(i)) == atom_identity(candidate.GetAtomWithIdx(j))
            and math.dist(points[i], p) <= TOLERANCE
        ]
        for i in fixed
    }
    order = sorted(fixed, key=lambda i: (len(choices[i]), i))
    states, exhausted, matches, failure = 0, False, [], "no_core_mapping"
    uncertain = set()

    def visit(mapping):
        nonlocal states, exhausted, failure
        if states >= search_limit:
            exhausted = True
            return
        states += 1
        if len(mapping) == len(fixed):
            status, reason = (
                stereo_status(source, candidate, mapping, points, output_points)
                if preserve_bonds
                else ("passed", None)
            )
            if status == "passed":
                matches.append(dict(mapping))
            else:
                failure = reason
                if status == "indeterminate":
                    uncertain.add(reason)
            return
        index = order[len(mapping)]
        for target in choices[index]:
            if target in mapping.values():
                continue
            if preserve_bonds and any(
                bond_identity(source, index, old) != bond_identity(candidate, target, new)
                for old, new in mapping.items()
            ):
                continue
            visit({**mapping, index: target})
            if exhausted or len(matches) > 1:
                break

    visit({})
    status = (
        "indeterminate"
        if exhausted or len(matches) > 1 or uncertain
        else "passed"
        if matches
        else "failed"
    )
    reason = (
        "mapping_budget_exhausted"
        if exhausted
        else "ambiguous_core_mapping"
        if len(matches) > 1
        else sorted(uncertain)[0]
        if uncertain
        else None
        if matches
        else failure
    )
    mapping = matches[0] if status == "passed" else {}
    return {
        "method": METHOD,
        "status": status,
        "reason": reason,
        "preserve_bonds": preserve_bonds,
        "tolerance_angstrom": TOLERANCE,
        "unit": "angstrom",
        "search_states": states,
        "mapping": [{"source_atom": i, "output_atom": mapping[i]} for i in fixed if i in mapping],
        "maximum_displacement": max(
            (math.dist(points[i], output_points[j]) for i, j in mapping.items()), default=None
        ),
    }
