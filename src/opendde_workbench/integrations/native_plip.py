"""Native PLIP chemical interaction types with exact original-coordinate endpoints."""

from importlib.metadata import version

from native_io import copy_artifact, csv_file, finish, input_file, metric
from native_structure import input_pdb
from plip_contacts import profile_contacts
from plip_coordinates import SourceCoordinates


def run(request):
    if request["operation"] == "protein_interface":
        from native_protein_interface import run as analyze_interface

        return analyze_interface(request)
    from plip.structure.preparation import PDBComplex

    source, _ = input_pdb(request, allow_component_aliases=True)
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
    interactions = profile_contacts(profile, original)
    original_source, _ = input_file(request, "structure")
    structure = copy_artifact(original_source, "interaction-structure" + original_source.suffix)
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
