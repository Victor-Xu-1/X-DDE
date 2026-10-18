"""Keep native sequence likelihood, sample multiplicity and exact mutation scope explicit."""

import math


def header_fields(description):
    return dict(part.strip().split("=", 1) for part in description.split(",") if "=" in part)


def probability(fields, key):
    number = float(fields[key])
    if not math.isfinite(number) or not 0 <= number <= 1:
        raise ValueError("Invalid native sequence likelihood or recovery: " + key)
    return number


def review_sequences(records, residues, selected):
    """Residues follow the original author order, not generated residue numbering."""
    original = records[0][1].replace(":", "")
    if original != "".join(value["amino_acid"] for value in residues):
        raise ValueError("Native original sequence differs from the exact input residue order.")
    fields = header_fields(records[0][0])
    count = int(fields["num_res"])
    ligand_count = int(fields["num_ligand_res"])
    if count < 1 or count != len(selected) or not 0 <= ligand_count <= count:
        raise ValueError("Native design mask differs from the selected residue identities.")
    if fields["use_ligand_context"] != "True":
        raise ValueError("The ligand-aware task disabled its original atomic context.")
    allowed = set(selected)
    draws, unique = [], {}
    for index, (description, sequence) in enumerate(records[1:], 1):
        sequence = sequence.replace(":", "")
        values = header_fields(description)
        if len(sequence) != len(original) or int(values["id"]) != index:
            raise ValueError("Native sequence length or sample identity changed.")
        mutations = [
            {"residue": residue["identity"], "original": before, "designed": after}
            for residue, before, after in zip(residues, original, sequence, strict=True)
            if before != after
        ]
        if any(item["residue"] not in allowed for item in mutations):
            raise ValueError("A native design changed a residue outside the requested mask.")
        sample_id = f"sequence-{index:03d}"
        unique.setdefault(sequence, sample_id)
        recovery = probability(values, "seq_rec")
        expected_recovery = 1 - len(mutations) / count
        if abs(recovery - expected_recovery) > 0.000051:
            raise ValueError("Native recovery differs from the exact selected-site mutations.")
        draws.append(
            {
                "candidate_id": sample_id,
                "first_identical_sample": unique[sequence],
                "mutations": mutations,
                "overall_likelihood": probability(values, "overall_confidence"),
                # Upstream exp(-0)=1 with an empty ligand score mask is not evidence.
                "ligand_likelihood": probability(values, "ligand_confidence")
                if ligand_count
                else None,
                "sequence_recovery": recovery,
            }
        )
    return {
        "original_sequence": original,
        "selected_residues": [value for value in residues if value["identity"] in allowed],
        "native_ligand_scored_residues": ligand_count,
        "native_ligand_score_cutoff_A": float(fields["ligand_cutoff_distance"]),
        "sample_count": len(draws),
        "unique_sequence_count": len(unique),
        "wild_type_samples": sum(not value["mutations"] for value in draws),
        "candidates": draws,
        "scope": "conditional_sequence_likelihood_not_binding_probability",
    }
