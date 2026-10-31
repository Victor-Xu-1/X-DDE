"""Named biological inputs for each native Harness task; unavailable populations stay explicit."""

from ...harness_contract import HarnessTask
from .catalogue import MANIFEST


def harness_study(capability, objects, sequences, *, antibody=None):
    if capability in {"fold", "epitope"} and antibody is None:
        return None
    structure = "asset:" + str(objects["receptor"].reference.asset_id)
    complex_path = "asset:" + str(objects["structure"].reference.asset_id)
    sequence = sequences["protein"]
    observed = sequences["observed_protein"]
    mutable = MANIFEST["observed_construct"]["mutable_position"]
    if capability in {"evolution", "compare"}:
        required = (
            ["proposal_history"]
            if capability == "evolution"
            else ["proposal_reference", "proposal_current"]
        )
        if any(key not in objects for key in required):
            return None
        payload = (
            {
                "candidates_json_path": "asset:"
                + str(objects["proposal_history"].reference.asset_id),
                "current_parent_id": "STAT6-WT",
                "objective_key": "loss",
                "minimize": True,
                "cycle": 1,
                "binder_chain_ids": ["A"],
            }
            if capability == "evolution"
            else {
                "legacy_path": "asset:" + str(objects["proposal_reference"].reference.asset_id),
                "current_path": "asset:" + str(objects["proposal_current"].reference.asset_id),
                "top_k": 3,
                "maximize": False,
            }
        )
        return HarnessTask(
            name="STAT6 · Scored single-site hypothesis " + capability,
            tool=capability,
            payload=payload,
            scientific_inputs=[objects[key].reference for key in required],
        ).model_dump(mode="json")
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
                    "candidate_id": "6WGL-deposited-Fv-control",
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
    if capability == "fold":
        payloads[capability]["options"].update(
            cdr_regions=antibody["cdr_regions"], cdr3_positions=antibody["cdr3_positions"]
        )
    elif capability == "epitope":
        payloads[capability]["cdr_regions"] = antibody["groups"]
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
    # Sequence-only native tools still need immutable material authority. The
    # inline sequence is an execution value, not a substitute for its source.
    sequence_roles = (
        ("protein_sequence",)
        if capability in {"esm", "esm2", "protrek-sequence", "target-msa"}
        else ("variable_domains", "antigen_sequence")
        if capability == "fold"
        else ()
    )
    for role in sequence_roles:
        reference = objects[role].reference
        if reference not in references:
            references.append(reference)
    if capability in {"fold", "epitope"}:
        references.append(objects["antibody_cdr_inputs"].reference)
    return HarnessTask(
        name=(
            "STAT6 pathway · "
            if capability in {"fold", "epitope", "protrek-structure"}
            else "STAT6 · "
        )
        + capability,
        tool=capability,
        payload=payloads[capability],
        scientific_inputs=references,
        allow_external=capability
        in {"fold", "protrek-sequence", "protrek-structure", "target-msa"},
    ).model_dump(mode="json")
