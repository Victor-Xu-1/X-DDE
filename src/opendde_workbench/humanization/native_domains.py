"""Reuse reviewed ANARCII identities instead of heuristic CDR positions."""

from manifest import MAX_SEQUENCE_LENGTH
from native_numbering import normalize_domain
from proposals import AMINO_ACIDS


def number(records, cpu, output):
    from anarcii import Anarcii

    eligible = {
        record["id"]: record["sequence"]
        for record in records
        if 70 <= len(record["sequence"]) <= MAX_SEQUENCE_LENGTH
        and set(record["sequence"]) <= set(AMINO_ACIDS)
    }
    model = Anarcii(
        seq_type="antibody",
        mode="accuracy",
        cpu=True,
        ncpu=cpu,
        batch_size=8,
        verbose=False,
        return_logits=False,
    )
    native = model.number(eligible, scfv=False) if eligible else {}
    if not isinstance(native, dict) or set(native) != set(eligible):
        raise ValueError("Native numbering changed the eligible source identifiers.")
    result = {}
    for index, record in enumerate(records):
        key = record["id"]
        if key not in eligible:
            result[key] = {"available": False, "reason": "unsupported_variable_region_input"}
            continue
        domain = normalize_domain(native[key], record, key, index, output, preserve=False)
        if domain["available"] and (
            domain["start"] != 0 or domain["end"] != len(record["sequence"]) - 1
        ):
            domain.update(available=False, reason="prepare_an_exact_variable_region_first")
        result[key] = domain
    return model, result


def validate_proposal_numbering(model, identifier, sequence, original, output, index):
    """A new proposal must retain the original chain and all protected CDR addresses."""
    response = model.number({identifier: sequence}, scfv=False)
    if not isinstance(response, dict) or set(response) != {identifier}:
        raise ValueError("Proposed sequence numbering changed its identifier.")
    candidate = normalize_domain(
        response[identifier],
        {"id": identifier, "sequence": sequence},
        identifier,
        index,
        output,
        preserve=False,
    )
    if (
        not candidate["available"]
        or candidate["start"] != 0
        or candidate["end"] != len(sequence) - 1
        or candidate["chain_type"] != original["chain_type"]
    ):
        raise ValueError("The proposal no longer has the original variable-region identity.")
    old = {
        (r["number"], r["insertion"]): r
        for r in original["numbering"]
        if r["region"] != "framework"
    }
    new = {
        (r["number"], r["insertion"]): r
        for r in candidate["numbering"]
        if r["region"] != "framework"
    }
    if set(old) != set(new) or any(
        old[key]["amino_acid"] != new[key]["amino_acid"]
        or old[key]["source_position"] != new[key]["source_position"]
        for key in old
    ):
        raise ValueError("Independent numbering found a changed CDR address or sequence.")
    return candidate
