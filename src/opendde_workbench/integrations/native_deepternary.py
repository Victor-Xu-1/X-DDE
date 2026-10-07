"""Native complete ternary hypotheses with explicit scientific and chemical lineage."""

import json
from pathlib import Path

import Bio
import torch
from native_io import csv_file, finish, metric
from native_proximity_chemistry import read_chemistry
from native_proximity_options import TernaryPayload
from native_proximity_outputs import write_proposal
from native_proximity_partners import read_partner, validate_bound_arm
from native_proximity_prediction import predictions
from rdkit import Chem, rdBase


def run(request):
    TernaryPayload.model_validate(request["payload"])
    if request["options"]["device"] != "cpu":
        raise ValueError("This installed native model has only the reviewed CPU execution profile.")
    full, indices, arms = read_chemistry(request)
    partners = [read_partner(request, role) for role in ("a", "b")]
    for index, (arm, _) in enumerate(arms):
        validate_bound_arm(arm, partners[index])
    predictions_found, search = predictions(request, full, arms, partners)
    proposals, candidates, mapping = [], [], None
    smiles = Chem.MolToSmiles(full, isomericSmiles=True)
    for index, prediction in enumerate(predictions_found, 1):
        row = write_proposal(full, indices, arms, partners, prediction, index)
        row.pop("ligand_atom_indices")
        current_mapping = row.pop("partner_mapping")
        if mapping is not None and current_mapping != mapping:
            raise ValueError(
                "Native proposals do not share the exact confirmed partner identities."
            )
        mapping = current_mapping
        proposals.append(row)
        if row["quality"]["accepted"]:
            metrics = []
            if row["ranking_surrogate"] is not None:
                metrics.append(
                    metric(
                        "Predicted P2 RMSD surrogate",
                        row["ranking_surrogate"],
                        "angstrom",
                        "DeepTernary learned ranking surrogate, not reference RMSD",
                        "score",
                    )
                )
            for identifier, artifact, kind in (
                (row["id"], row["complex_artifact"], None),
                (row["id"] + "-ligand", row["ligand_artifact"], smiles),
            ):
                candidates.append(
                    {
                        "id": identifier,
                        "artifact": artifact,
                        "smiles": kind,
                        "metrics": metrics,
                        "geometry": "predicted_structure",
                    }
                )
    if mapping is None:
        mapping = [
            {"output_chain": "AB"[i], "source": partner["source"], "atoms": partner["identities"]}
            for i, partner in enumerate(partners)
        ]
    source = next(item["source"] for item in request["inputs"] if item["role"] == "ligand")
    result = {
        "mechanism": request["payload"]["mechanism"],
        "source_ligand": source,
        "ligand_atom_indices": indices,
        "partner_mapping": mapping,
        "arm_maps": [[indices[index] for index in mapping] for _, mapping in arms],
        "assemblies": proposals,
        "search": search,
        "versions": {
            "torch": torch.__version__,
            "rdkit": rdBase.rdkitVersion,
            "biopython": Bio.__version__,
        },
    }
    csv_file(
        "assemblies.csv",
        [
            "Assembly",
            "Basic geometry passed",
            "Model ranking surrogate",
            "Arm A displacement (angstrom)",
            "Arm B displacement (angstrom)",
            "Ligand-protein severe pairs",
            "Protein-protein severe pairs",
            "MMFF94s relaxation difference (kcal/mol)",
        ],
        [
            [
                row["id"],
                row["quality"]["accepted"],
                "" if row["ranking_surrogate"] is None else row["ranking_surrogate"],
                *[
                    ""
                    if head["rmsd_from_binary_angstrom"] is None
                    else head["rmsd_from_binary_angstrom"]
                    for head in row["quality"]["arms"]
                ],
                row["quality"]["ligand_partner_a_severe_pairs"]
                + row["quality"]["ligand_partner_b_severe_pairs"],
                row["quality"]["partner_partner_severe_pairs"],
                row["quality"]["relaxation"]["difference_kcal_mol"]
                if row["quality"]["relaxation"]["difference_kcal_mol"] is not None
                else "",
            ]
            for row in proposals
        ],
    )
    # Internal execution diagnostics stay server-side and out of the research file manifest.
    recipes = json.loads(Path("/platform/recipes.json").read_text())["programs"]
    finish(request, recipes["deepternary"]["version"], candidates=candidates, proximity=result)
