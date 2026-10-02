"""Guided campaign inputs from unchanged native domains and deposited target sequences."""

import json

from ..antibodies.result import validate_numbering
from ..artifacts import contained
from .pins import ExamplePins


def campaign_draft(scientific, state, objects, sequences):
    if "variable_domains" not in objects or "antigen" not in sequences:
        return None
    pin = ExamplePins(scientific.store, state).get("antibody.number", verify=True)
    if pin is None:
        return None
    job = scientific.store.get(str(pin.job_id))
    output = state / "jobs" / str(pin.job_id) / "output"
    result = validate_numbering(
        json.loads(contained(output, "result.json").read_text()), job.request, output
    )
    binders, cdr, fixed = {}, {}, {}
    for domain in result.domains:
        if not domain.available:
            continue
        chain = "B" if domain.chain_type == "H" else "A"
        if chain in binders:
            raise ValueError("The campaign requires one exact heavy and one light variable domain.")
        binders[chain] = domain.sequence
        cdr[chain] = [
            residue.source_position - 1 - domain.start
            for residue in domain.numbering
            if residue.region != "framework"
        ]
        if any(not 0 <= position < len(domain.sequence) for position in cdr[chain]):
            raise ValueError("Native CDR positions do not belong to the exact domain sequence.")
        fixed[chain] = sorted(set(range(len(domain.sequence))) - set(cdr[chain]))
    if set(binders) != {"B", "A"}:
        raise ValueError("The campaign requires both native variable domains.")
    return {
        "targetName": "HER2 · deposited 6LBX domain IV construct",
        "targets": {"C": sequences["antigen"]},
        "format": "VHVL",
        "binders": binders,
        "cdr": cdr,
        "fixed": fixed,
        "budget": "small",
    }
