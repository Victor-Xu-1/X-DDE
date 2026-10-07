"""Independent full-graph geometry and steric checks; no invented activity score."""

from copy import deepcopy

import numpy as np
from deepternary.models.rotate_utils import rotate_and_translate
from rdkit import Chem
from rdkit.Chem import AllChem
from scipy.spatial import cKDTree


def severe_pairs(first, first_elements, second, second_elements):
    table = Chem.GetPeriodicTable()
    tree = cKDTree(second)
    count, minimum = 0, None
    for index, candidates in enumerate(tree.query_ball_point(first, r=4.5)):
        for other in candidates:
            distance = float(np.linalg.norm(first[index] - second[other]))
            minimum = distance if minimum is None else min(minimum, distance)
            limit = 0.65 * (
                table.GetRvdw(first_elements[index]) + table.GetRvdw(second_elements[other])
            )
            if distance < limit:
                count += 1
    return count, minimum


def stereochemistry_preserved(source, candidate):
    expected = {
        a.GetIdx(): a.GetProp("_CIPCode") for a in source.GetAtoms() if a.HasProp("_CIPCode")
    }
    physical = deepcopy(candidate)
    Chem.RemoveStereochemistry(physical)
    Chem.AssignStereochemistryFrom3D(physical, replaceExistingTags=True)
    Chem.AssignStereochemistry(physical, cleanIt=True, force=True)
    actual = {
        a.GetIdx(): a.GetProp("_CIPCode") for a in physical.GetAtoms() if a.HasProp("_CIPCode")
    }
    atoms = all(actual.get(index) == code for index, code in expected.items())
    bonds = all(
        b.GetStereo() == physical.GetBondWithIdx(b.GetIdx()).GetStereo()
        for b in source.GetBonds()
        if b.GetStereo() not in {Chem.BondStereo.STEREONONE, Chem.BondStereo.STEREOANY}
    )
    return atoms and bonds


def relaxation_difference(candidate):
    molecule = Chem.AddHs(deepcopy(candidate), addCoords=True)
    if not AllChem.MMFFHasAllMoleculeParams(molecule):
        return {"status": "unsupported_parameters", "difference_kcal_mol": None}
    properties = AllChem.MMFFGetMoleculeProperties(molecule, mmffVariant="MMFF94s")
    force = AllChem.MMFFGetMoleculeForceField(molecule, properties)
    initial = float(force.CalcEnergy())
    converged = force.Minimize(maxIts=500)
    final = float(force.CalcEnergy())
    if not np.isfinite([initial, final]).all() or final > initial + 0.001:
        raise ValueError("The independent molecular relaxation returned invalid potential energy.")
    return {
        "status": "converged" if converged == 0 else "not_converged",
        "difference_kcal_mol": max(0.0, initial - final) if converged == 0 else None,
    }


def check_candidate(source, candidate, arms, partners, prediction):
    position = candidate.GetConformer().GetPositions()
    table = Chem.GetPeriodicTable()
    elements = [a.GetAtomicNum() for a in candidate.GetAtoms()]
    bad_bonds = []
    for bond in candidate.GetBonds():
        a, b = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        length = float(np.linalg.norm(position[a] - position[b]))
        covalent = table.GetRcovalent(elements[a]) + table.GetRcovalent(elements[b])
        if not 0.65 * covalent <= length <= 1.3 * covalent:
            bad_bonds.append({"a": a, "b": b, "length_angstrom": length})
    internal = 0
    topology = Chem.GetDistanceMatrix(candidate)
    for a, b in cKDTree(position).query_pairs(r=4.5):
        if topology[a, b] > 2:
            limit = 0.65 * (table.GetRvdw(elements[a]) + table.GetRvdw(elements[b]))
            internal += float(np.linalg.norm(position[a] - position[b])) < limit
    first = partners[0]["coordinates"]
    second = rotate_and_translate(
        partners[1]["coordinates"],
        prediction["rotation"],
        prediction["translation"],
    )
    partner_elements = [
        [table.GetAtomicNumber(row["element"]) for row in partner["identities"]]
        for partner in partners
    ]
    clash_a, _ = severe_pairs(position, elements, first, partner_elements[0])
    clash_b, _ = severe_pairs(position, elements, second, partner_elements[1])
    clash_partners, _ = severe_pairs(first, partner_elements[0], second, partner_elements[1])
    heads = []
    for index, (arm, mapping) in enumerate(arms):
        binary = arm.GetConformer().GetPositions()
        protein = first
        if index == 1:
            binary = rotate_and_translate(binary, prediction["rotation"], prediction["translation"])
            protein = second
        rmsd = float(np.sqrt(np.mean(np.sum((position[list(mapping)] - binary) ** 2, axis=1))))
        nearest, _ = cKDTree(protein).query(position[list(mapping)], k=1)
        heads.append(
            {
                "rmsd_from_binary_angstrom": rmsd,
                "contacting_heavy_atoms": int(np.count_nonzero(nearest <= 4.5)),
            }
        )
    if not arms:
        for protein in (first, second):
            nearest, _ = cKDTree(protein).query(position, k=1)
            heads.append(
                {
                    "rmsd_from_binary_angstrom": None,
                    "contacting_heavy_atoms": int(np.count_nonzero(nearest <= 4.5)),
                }
            )
    stereo = stereochemistry_preserved(source, candidate)
    accepted = (
        not (bad_bonds or internal or clash_a or clash_b or clash_partners)
        and stereo
        and all(
            row["contacting_heavy_atoms"] >= 3
            and (row["rmsd_from_binary_angstrom"] is None or row["rmsd_from_binary_angstrom"] <= 3)
            for row in heads
        )
    )
    return {
        "accepted": bool(accepted),
        "bond_violations": bad_bonds,
        "intramolecular_severe_pairs": int(internal),
        "ligand_partner_a_severe_pairs": clash_a,
        "ligand_partner_b_severe_pairs": clash_b,
        "partner_partner_severe_pairs": clash_partners,
        "stereochemistry_preserved": stereo,
        "arms": heads,
        "relaxation": relaxation_difference(candidate),
        "method": "X-DDE independent covalent-radius/steric/binary-frame/stereo checks v1",
        "scope": "basic_geometry_not_experimental_activity_or_complete_posebusters_acceptance",
    }
