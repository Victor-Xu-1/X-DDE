"""Named biological inputs for each native Harness task; unavailable populations stay explicit."""

from ...harness_contract import HarnessTask
from .catalogue import MANIFEST


def harness_study(capability, objects, sequences):
    structure = "asset:" + str(objects["receptor"].reference.asset_id)
    complex_path = "asset:" + str(objects["structure"].reference.asset_id)
    sequence = sequences["protein"]
    observed = sequences["observed_protein"]
    mutable = MANIFEST["observed_construct"]["mutable_position"]
    payloads = {
        "esm": {"sequences": [sequence], "options": {"offline": True, "batch_size": 1}},
        "esm2": {
            "parent_id": "STAT6-P42226",
            "parent_chains": {"A": sequence},
            "mutable_positions": {"A": [613]},
            "num_sequences": 4,
            "min_llr": 0,
            "options": {"offline": True, "batch_size": 1},
        },
        "mpnn": {
            "structure_path": structure,
            "parent_chains": {"A": observed},
            "mutable_positions": {"A": [mutable]},
            "num_sequences": 4,
            "parameters": {"temperature": 0.1, "relax_radius": 3, "wt_bias": 2},
        },
        "fold": {
            "candidates": [
                {
                    "candidate_id": "dupilumab-6WGL",
                    "chains": {"A": sequences["heavy"], "B": sequences["light"]},
                }
            ],
            "options": {
                "target_chains": {"C": sequences["antigen"]},
                "binder_chain_ids": ["A", "B"],
                "target_chain_ids": ["C"],
            },
        },
        "epitope": {
            "structure_path": complex_path,
            "antibody_chains": ["A", "B"],
            "antigen_chains": ["C"],
            "cdr_regions": {},
            "cutoff": 4.5,
            "hotspots": [],
        },
        "rmsd": {
            "reference_path": structure,
            "mobile_path": "asset:" + str(objects["receptor_b"].reference.asset_id),
            "binder_chain_ids": [],
            "target_chain_ids": ["A"],
        },
        "protrek-sequence": {"sequence": sequence, "topk": 5},
        "protrek-structure": {"structure_path": structure, "chain": "A", "topk": 5},
        "target-msa": {
            "target_name": "STAT6 · P42226",
            "chain_id": "A",
            "sequence": sequence,
            "required": True,
        },
    }
    if capability not in payloads:
        return None
    paths = {str(obj.reference.asset_id): obj.reference for obj in objects.values()}
    references = []

    def visit(value):
        if isinstance(value, str) and value.startswith("asset:"):
            reference = paths[value[6:]]
            if reference not in references:
                references.append(reference)
        elif isinstance(value, dict):
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(payloads[capability])
    return HarnessTask(
        name=("STAT6 pathway · " if capability in {"fold", "epitope"} else "STAT6 · ") + capability,
        tool=capability,
        payload=payloads[capability],
        scientific_inputs=references,
        allow_external=capability
        in {"fold", "protrek-sequence", "protrek-structure", "target-msa"},
    ).model_dump(mode="json")
