"""Prospective chemical-construction experiment, never a retained-task rewrite.

The diffusion model predicts atoms/coordinates, not bonds. This experiment masks
candidate construction at protected core atoms, then fixes the entire core during
MMFF94s refinement. It is not a validated platform protocol or an affinity model.
"""

from collections import Counter

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem


def reconstruct(source, candidate, mapping, ports):
    """Construct one bounded graph; never drop atoms or reconnect fragments."""
    inverse = {target: original for original, target in mapping.items()}
    if len(inverse) != len(mapping) or not mapping:
        raise ValueError("Require an unambiguous, independently checked core mapping.")
    remaining = {index: Counter(value) for index, value in ports.items()}
    proposed = {index: Counter() for index in mapping}
    for bond in candidate.GetBonds():
        edge = (bond.GetBeginAtomIdx(), bond.GetEndAtomIdx())
        core = [index for index in edge if index in inverse]
        if len(core) == 1:
            proposed[inverse[core[0]]][(str(bond.GetBondType()), bond.GetIsAromatic())] += 1
    if any(
        count > remaining[index][key] > 0
        for index, counts in proposed.items()
        for key, count in counts.items()
    ):
        raise ValueError("Competing cut-site attachments require another explicit proposal.")
    editable = Chem.RWMol()
    for index, atom in enumerate(candidate.GetAtoms()):
        original = source.GetAtomWithIdx(inverse[index]) if index in inverse else atom
        copied = Chem.Atom(original)
        copied.SetNoImplicit(False)
        editable.AddAtom(copied)
    excluded = []
    for bond in candidate.GetBonds():
        left, right = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        core = [index for index in (left, right) if index in inverse]
        if len(core) == 2:
            continue  # Core bonds come from the supplied molecular graph below.
        if core:
            original = inverse[core[0]]
            key = (str(bond.GetBondType()), bond.GetIsAromatic())
            if remaining[original][key] == 0:
                excluded.append((left, right))
                continue
            remaining[original][key] -= 1
        editable.AddBond(left, right, bond.GetBondType())
    for bond in source.GetBonds():
        left, right = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if left in mapping and right in mapping:
            editable.AddBond(mapping[left], mapping[right], bond.GetBondType())
    molecule = editable.GetMol()
    molecule.AddConformer(Chem.Conformer(candidate.GetConformer()), assignId=True)
    Chem.SanitizeMol(molecule)
    if len(Chem.GetMolFrags(molecule)) != 1:
        raise ValueError("Masked reconstruction is disconnected; no fragment was discarded.")
    return molecule, excluded


def refine(molecule, fixed, protein, *, iterations=1000):
    """Hard fixed core; optional heavy-atom steric restraints are not binding energy."""
    if not 1 <= iterations <= 1000 or len(set(fixed)) != len(fixed) or not fixed:
        raise ValueError("Use a bounded budget and distinct fixed atom indices.")
    if any(index < 0 or index >= molecule.GetNumAtoms() for index in fixed):
        raise ValueError("Fixed atoms must belong to the constructed graph.")
    work = Chem.AddHs(Chem.Mol(molecule), addCoords=True)
    if not AllChem.MMFFHasAllMoleculeParams(work):
        raise ValueError("The complete graph lacks reviewed MMFF parameters.")
    properties = AllChem.MMFFGetMoleculeProperties(work, mmffVariant="MMFF94s")
    force = AllChem.MMFFGetMoleculeForceField(work, properties)
    before = work.GetConformer().GetPositions().copy()
    for index in fixed:
        force.AddFixedPoint(index)
    table = Chem.GetPeriodicTable()
    mobile = sorted(set(range(molecule.GetNumAtoms())) - set(fixed))
    extra, pairs = {}, 0
    for index in mobile:
        for other, (position, element) in enumerate(protein):
            if np.linalg.norm(before[index] - position) > 6:
                continue
            if other not in extra:
                if len(extra) >= 512:
                    raise ValueError("The local protein-point budget was exceeded.")
                extra[other] = force.AddExtraPoint(*position, fixed=True) - 1
            limit = 0.85 * (
                table.GetRvdw(work.GetAtomWithIdx(index).GetAtomicNum())
                + table.GetRvdw(element)
            )
            force.MMFFAddDistanceConstraint(index, extra[other], False, limit, 10000, 100)
            pairs += 1
            if pairs > 4096:
                raise ValueError("The finite steric-restraint budget was exceeded.")
    force.Initialize()
    initial = float(force.CalcEnergy())
    status = force.Minimize(maxIts=iterations)
    final = float(force.CalcEnergy())
    after = work.GetConformer().GetPositions()
    if not np.isfinite(after).all() or not np.isfinite([initial, final]).all():
        raise ValueError("Nonfinite refinement cannot become a candidate.")
    movement = float(np.linalg.norm(after[fixed] - before[fixed], axis=1).max())
    positions = np.asarray(force.Positions()).reshape(-1, 3)
    protein_moved = any(
        np.linalg.norm(positions[index] - protein[original][0]) > 1e-8
        for original, index in extra.items()
    )
    if movement > 1e-8 or protein_moved or final > initial + 0.001:
        raise ValueError("Refinement violated its fixed-core or energy invariant.")
    return Chem.RemoveHs(work), {
        "converged": status == 0,
        "maximum_core_movement_angstrom": movement,
        "protein_points": len(extra),
        "steric_restraints": pairs,
        "initial_composite_energy_kcal_mol": initial,
        "final_composite_energy_kcal_mol": final,
        "scope": "MMFF94s_plus_geometric_repulsion_not_binding_energy",
    }
