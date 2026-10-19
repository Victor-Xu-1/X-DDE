"""Bounded exact-file batch contracts; names are labels, never paths or commands."""

import re


def validate_interface_inputs(task):
    payload = task.payload
    if not 1 <= len(task.inputs) <= 3 or any(i.role != "structure" for i in task.inputs):
        raise ValueError("Select one to three complete protein complexes.")
    sources = [i.source.model_dump_json() for i in task.inputs]
    if len(set(sources)) != len(sources):
        raise ValueError("Choose distinct exact complexes for comparison.")
    if len(payload.candidate_names) != len(task.inputs) or any(
        not re.fullmatch(r"[^\x00-\x1f\x7f]{1,80}", name) or not name.strip()
        for name in payload.candidate_names
    ):
        raise ValueError("Name every selected complex with a short, nonempty label.")
    for chains in (payload.target_chains, payload.binder_chains):
        if len(set(chains)) != len(chains) or any(
            not re.fullmatch(r"[A-Za-z0-9]", chain) for chain in chains
        ):
            raise ValueError("Select distinct one-character source chains.")
    if set(payload.target_chains) & set(payload.binder_chains):
        raise ValueError("Target and partner chains must be disjoint.")
