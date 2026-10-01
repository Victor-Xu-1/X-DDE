"""Use native residue probabilities while preserving exact IMGT CDRs and source cysteines."""

import math

AMINO_ACIDS = tuple("ACDEFGHIKLMNPQRSTVWY")


def validate_scores(value, sequence):
    if len(value) != len(sequence) or any(set(row) != set(AMINO_ACIDS) for row in value):
        raise ValueError("Native residue scores changed sequence positions or amino-acid coverage.")
    if any(
        isinstance(score, bool)
        or not isinstance(score, (int, float))
        or not math.isfinite(score)
        or not 0 <= score <= 1
        for row in value
        for score in row.values()
    ):
        raise ValueError("Native Sapiens returned invalid residue probabilities.")
    # The upstream softmax includes special tokens; do not renormalize the returned20 columns.
    if any(sum(row.values()) > 1 + 1e-5 for row in value):
        raise ValueError("Native Sapiens probabilities have inconsistent coverage.")


def propose(sequence, current, scores, numbering, max_mutations):
    validate_scores(scores, current)
    if len(sequence) != len(current) or len(numbering) != len(sequence):
        raise ValueError(
            "Framework proposals require an exact, untrimmed numbered variable region."
        )
    protected = {
        index
        for index, residue in enumerate(numbering)
        if residue["region"] != "framework" or sequence[index] == "C"
    }
    if any(
        residue["amino_acid"] != sequence[index] or residue["source_position"] != index + 1
        for index, residue in enumerate(numbering)
    ):
        raise ValueError("Numbered residues differ from the original source sequence.")
    if any(current[index] != sequence[index] for index in protected):
        raise ValueError("An input proposal already changed a protected source residue.")
    choices = []
    for index, row in enumerate(scores):
        if index in protected:
            continue
        available = [amino_acid for amino_acid in AMINO_ACIDS if amino_acid != "C"]
        best = max(available, key=lambda aa: (row[aa], -AMINO_ACIDS.index(aa)))
        if best == sequence[index]:
            continue
        gain = row[best] - row[sequence[index]]
        if gain > 0:
            choices.append((gain, index, best))
    chosen = sorted(choices, key=lambda item: (-item[0], item[1]))[:max_mutations]
    result = list(sequence)
    for _, index, amino_acid in chosen:
        result[index] = amino_acid
    proposal = "".join(result)
    if any(proposal[index] != sequence[index] for index in protected):
        raise ValueError("The native-guided proposal changed an original CDR or cysteine.")
    changes = [
        {
            "source_position": index + 1,
            "number": numbering[index]["number"],
            "insertion": numbering[index]["insertion"],
            "before": sequence[index],
            "after": proposal[index],
            "native_probability_gain": gain,
        }
        for gain, index, _ in sorted(chosen, key=lambda item: item[1])
    ]
    return proposal, changes
