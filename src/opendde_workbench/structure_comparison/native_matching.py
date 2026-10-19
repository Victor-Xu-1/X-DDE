"""Explicit chain correspondence preserves insertions, mutations and missing observations."""


def sequence_indices(left, right):
    from Bio.Align import PairwiseAligner

    aligner = PairwiseAligner(
        mode="global",
        match_score=2,
        mismatch_score=-1,
        open_gap_score=-8,
        extend_gap_score=-0.5,
    )
    alignments = iter(aligner.align(left, right))
    first = next(alignments, None)
    if first is None:
        raise ValueError("Selected chains have no sequence correspondence.")
    if next(alignments, None) is not None:
        raise ValueError(
            "Sequence correspondence is ambiguous; choose reviewed author-number correspondence "
            "or prepare an unambiguous structural selection."
        )
    pairs = []
    for left_block, right_block in zip(first.aligned[0], first.aligned[1], strict=True):
        start, end = map(int, left_block)
        other, finish = map(int, right_block)
        if end - start != finish - other:
            raise ValueError("Sequence alignment returned inconsistent blocks.")
        pairs.extend(zip(range(start, end), range(other, finish), strict=True))
    return pairs


def author_indices(reference, moving):
    def address(row):
        return row[2]["number"], row[2]["insertion_code"]

    left = {address(row): index for index, row in enumerate(reference)}
    right = {address(row): index for index, row in enumerate(moving)}
    if len(left) != len(reference) or len(right) != len(moving):
        raise ValueError("Observed author residue identities are not unique.")
    return [(left[key], right[key]) for key in sorted(left.keys() & right.keys())]


def mapped_pairs(reference, moving, mappings, options, role):
    pairs, evidence = [], []
    for mapping in mappings:
        left = reference.get(mapping.reference)
        right = moving.get(mapping.moving)
        if not left or not right:
            raise ValueError("Every mapped chain must contain observed protein C-alpha residues.")
        if max(len(left), len(right)) > 2000:
            raise ValueError("A comparison chain exceeds 2000 observed residues.")
        indices = (
            sequence_indices("".join(row[0] for row in left), "".join(row[0] for row in right))
            if options.correspondence == "sequence"
            else author_indices(left, right)
        )
        identical = sum(left[i][0] == right[j][0] for i, j in indices)
        identity = identical / len(indices) if indices else 0
        coverage = len(indices) / max(len(left), len(right))
        if identity < options.minimum_identity or coverage < options.minimum_coverage:
            raise ValueError(
                "Mapped chain identity or observed-residue coverage is below the declared limit."
            )
        # Mutated aligned residues remain in the evaluated RMSD; dropping them biases it.
        pairs.extend((left[i], right[j]) for i, j in indices)
        matched_left, matched_right = {pair[0] for pair in indices}, {pair[1] for pair in indices}
        evidence.append(
            {
                "role": role,
                "reference_chain": mapping.reference,
                "moving_chain": mapping.moving,
                "reference_observed": len(left),
                "moving_observed": len(right),
                "matched": len(indices),
                "identical": identical,
                "identity": identity,
                "reference_coverage": len(indices) / len(left),
                "moving_coverage": len(indices) / len(right),
                "coverage": coverage,
                "unmatched_reference": [
                    row[2] for i, row in enumerate(left) if i not in matched_left
                ],
                "unmatched_moving": [
                    row[2] for i, row in enumerate(right) if i not in matched_right
                ],
            }
        )
    minimum = options.minimum_target_pairs if role == "target" else options.minimum_partner_pairs
    if not minimum <= len(pairs) <= 5000:
        raise ValueError("The selected comparison role has too few or too many matched residues.")
    return pairs, evidence
