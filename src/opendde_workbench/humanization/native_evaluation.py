"""Native Sapiens probabilities and exact reference-peptide matches are distinct measurements."""

from native_models import scores
from proposals import propose


def summary(sequence, values, database):
    peptides = database.chop_seq_peptides(sequence)
    matched = [database.contains(peptide) for peptide in peptides]
    fraction = database.compute_peptide_content(sequence)
    if fraction != sum(matched) / len(matched):
        raise ValueError("Native peptide content disagrees with its individual reference matches.")
    return {
        "mean_native_residue_probability": sum(
            row[aa] for row, aa in zip(values, sequence, strict=True)
        )
        / len(sequence),
        "oas_peptide_fraction": fraction,
        "matched_peptides": sum(matched),
        "total_peptides": len(matched),
        "peptides": [
            {"source_position": index + 1, "sequence": peptide, "matched": found}
            for index, (peptide, found) in enumerate(zip(peptides, matched, strict=True))
        ],
    }


def evaluate(record, domain, options, database):
    sequence, chain = record["sequence"], domain["chain_type"]
    original = scores(sequence, chain)
    current, values, history = sequence, original, []
    if options.mode == "framework":
        for iteration in range(options.iterations):
            proposal, changes = propose(
                sequence, current, values, domain["numbering"], options.max_mutations
            )
            history.append(
                {
                    "iteration": iteration + 1,
                    "input_sequence": current,
                    "native_scores": values,
                    "proposal": proposal,
                    "changes": changes,
                }
            )
            if proposal == current:
                break
            current = proposal
            values = scores(current, chain)
    return {
        "original_scores": original,
        "original_evaluation": summary(sequence, original, database),
        "proposal": current if current != sequence else None,
        "proposal_scores": values if current != sequence else None,
        "proposal_evaluation": summary(current, values, database) if current != sequence else None,
        "iterations": history,
    }
