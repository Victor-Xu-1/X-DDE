"""Native PLIP chemical interaction types with exact original-coordinate endpoints."""

import math
from importlib.metadata import version

from native_io import copy_artifact, csv_file, finish, metric
from native_structure import input_pdb


def atom_coordinates(file):
    points = {}
    for line in file.read_text().splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            serial = int(line[6:11])
            if serial in points:
                raise ValueError(
                    "Choose one structural model with unique original atom identities."
                )
            points[serial] = [float(line[30:38]), float(line[38:46]), float(line[46:54])]
    return points


def edge(kind, item, protein, ligand):
    protein_point = [float(v) for v in protein]
    ligand_point = [float(v) for v in ligand]
    return {
        "kind": kind,
        "chain": str(item.reschain),
        "number": int(item.resnr),
        "residue": str(item.restype),
        "protein_position": protein_point,
        "ligand_position": ligand_point,
        "distance": math.dist(protein_point, ligand_point),
    }


def run(request):
    from plip.structure.preparation import PDBComplex

    source, _ = input_pdb(request)
    original = atom_coordinates(source)
    complex_ = PDBComplex()
    complex_.output_path = "/output/native"
    complex_.load_pdb(str(source))
    complex_.analyze()
    payload = request["payload"]
    selected = [
        value
        for ligand, value in complex_.interaction_sets.items()
        if ligand.split(":")[-2:] == [payload["ligand_chain"], str(payload["ligand_number"])]
    ]
    if len(selected) != 1:
        raise ValueError("Choose one recognized ligand residue in the exact complex.")
    profile = selected[0]
    interactions = []
    for item in profile.hydrophobic_contacts:
        interactions.append(
            edge(
                "hydrophobic", item, original[item.bsatom_orig_idx], original[item.ligatom_orig_idx]
            )
        )
    for values, protein_donor in ((profile.hbonds_pdon, True), (profile.hbonds_ldon, False)):
        for item in values:
            protein = item.d_orig_idx if protein_donor else item.a_orig_idx
            ligand = item.a_orig_idx if protein_donor else item.d_orig_idx
            interactions.append(edge("hydrogen_bond", item, original[protein], original[ligand]))
    for item in profile.pistacking:
        interactions.append(edge("pi_stack", item, item.proteinring.center, item.ligandring.center))
    for values, positive in ((profile.saltbridge_pneg, False), (profile.saltbridge_lneg, True)):
        for item in values:
            protein = item.positive.center if positive else item.negative.center
            ligand = item.negative.center if positive else item.positive.center
            interactions.append(edge("salt_bridge", item, protein, ligand))
    for item in profile.pication_laro:
        interactions.append(edge("pi_cation", item, item.charge.center, item.ring.center))
    for item in profile.pication_paro:
        interactions.append(edge("pi_cation", item, item.ring.center, item.charge.center))
    for item in profile.halogen_bonds:
        interactions.append(
            edge("halogen_bond", item, original[item.acc_orig_idx], original[item.don_orig_idx])
        )
    structure = copy_artifact(source, "interaction-structure.pdb")
    csv_file(
        "interactions.csv",
        ["Type", "Chain", "Residue", "Number", "Distance (Å)"],
        [
            [row["kind"], row["chain"], row["residue"], row["number"], row["distance"]]
            for row in interactions
        ],
    )
    finish(
        request,
        version("plip"),
        metrics=[
            metric(
                "Classified interactions",
                len(interactions),
                "count",
                "PLIP native chemical classification",
                "descriptor",
            )
        ],
        structure_artifact=structure,
        interactions=interactions,
    )
