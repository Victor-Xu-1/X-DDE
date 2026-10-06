"""Native PLIP chemical interaction types with exact original-coordinate endpoints."""

import math
from importlib.metadata import version

from native_io import copy_artifact, csv_file, finish, metric
from native_structure import input_pdb
from plip_coordinates import SourceCoordinates


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
    payload = request["payload"]
    original = SourceCoordinates(source, payload["ligand_chain"], payload["ligand_number"])
    complex_ = PDBComplex()
    complex_.output_path = "/output/native"
    complex_.load_pdb(str(source))
    complex_.analyze()
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
                "hydrophobic",
                item,
                original.atom(
                    item.bsatom, protein=(str(item.reschain), int(item.resnr), str(item.restype))
                ),
                original.atom(item.ligatom, ligand=True),
            )
        )
    for values, protein_donor in ((profile.hbonds_pdon, True), (profile.hbonds_ldon, False)):
        for item in values:
            protein = item.d if protein_donor else item.a
            ligand = item.a if protein_donor else item.d
            interactions.append(
                edge(
                    "hydrogen_bond",
                    item,
                    original.atom(
                        protein, protein=(str(item.reschain), int(item.resnr), str(item.restype))
                    ),
                    original.atom(ligand, ligand=True),
                )
            )
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
            edge("halogen_bond", item, original.atom(item.acc), original.atom(item.don))
        )
    for item in profile.water_bridges:
        protein = item.d if item.protisdon else item.a
        ligand = item.a if item.protisdon else item.d
        row = edge("water_bridge", item, original.atom(protein), original.atom(ligand))
        row["bridge_position"] = original.atom(item.water)
        interactions.append(row)
    for item in profile.metal_complexes:
        if "protein" in item.location:
            interactions.append(
                edge(
                    "metal_complex",
                    item,
                    original.atom(item.target),
                    original.atom(item.metal),
                )
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
