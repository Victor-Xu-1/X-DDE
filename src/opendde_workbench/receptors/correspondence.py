"""Bounded observed C-alpha correspondence; ambiguity requires explicit user choice."""


def sequence_pairs(reference, moving):
    from Bio.Align import PairwiseAligner

    aligner = PairwiseAligner(
        mode="global",
        match_score=2.0,
        mismatch_score=-1.0,
        open_gap_score=-8.0,
        extend_gap_score=-0.5,
    )
    left = "".join(r[0] for r in reference)
    right = "".join(r[0] for r in moving)
    iterator = iter(aligner.align(left, right))
    first = next(iterator, None)
    if first is None:
        return {
            "pairs": [],
            "identity": 0.0,
            "ambiguous": False,
            "aligned_count": 0,
            "identical_count": 0,
        }
    # Do not count an exponential set of optimal alignments or silently choose its first.
    ambiguous = next(iterator, None) is not None
    aligned, identical, pairs = 0, 0, []
    for first_block, second_block in zip(first.aligned[0], first.aligned[1], strict=True):
        start, end = map(int, first_block)
        other, finish = map(int, second_block)
        if end - start != finish - other:
            raise ValueError("Native sequence alignment returned inconsistent paired blocks.")
        for i, j in zip(range(start, end), range(other, finish), strict=True):
            aligned += 1
            if reference[i][0] == moving[j][0]:
                identical += 1
                pairs.append((reference[i], moving[j]))
    return {
        "pairs": pairs,
        "identity": identical / aligned if aligned else 0.0,
        "ambiguous": ambiguous,
        "aligned_count": aligned,
        "identical_count": identical,
    }


def key(address):
    return address["chain"], address["number"], address["insertion_code"]


def correspond(reference, moving, selection, options):
    if selection.residue_pairs:
        lookup_ref = {key(row[2]): row for rows in reference.values() for row in rows}
        lookup_move = {key(row[2]): row for rows in moving.values() for row in rows}
        pairs = []
        for anchor in selection.residue_pairs:
            left = lookup_ref.get(key(anchor.reference.model_dump()))
            right = lookup_move.get(key(anchor.moving.model_dump()))
            if left is None or right is None:
                raise ValueError("An explicit anchor does not exist in its exact selected model.")
            pairs.append((left, right))
        identity = sum(a[0] == b[0] for a, b in pairs) / len(pairs)
        method = "explicit_ca_residue_anchors"
    else:
        pairs, identities, assigned = [], [], set()
        if selection.chain_pairs:
            links = [(p.reference, p.moving) for p in selection.chain_pairs]
        else:
            links = []
            for name, rows in reference.items():
                candidates = []
                for candidate, other in moving.items():
                    evidence = sequence_pairs(rows, other)
                    if evidence["identity"] >= options.minimum_identity and evidence["pairs"]:
                        coverage = len(evidence["pairs"]) / max(len(rows), len(other))
                        candidates.append((evidence["identity"], coverage, candidate, evidence))
                if not candidates:
                    continue
                best = max((c[0], c[1]) for c in candidates)
                chosen = [c for c in candidates if (c[0], c[1]) == best]
                if len(chosen) != 1 or chosen[0][3]["ambiguous"]:
                    raise ValueError(
                        "Observed chain/sequence correspondence is ambiguous; "
                        "choose chains or explicit residue anchors."
                    )
                links.append((name, chosen[0][2]))
        for left, right in links:
            if left not in reference or right not in moving or right in assigned:
                raise ValueError("Chain mapping is missing or reuses a moving chain.")
            assigned.add(right)
            evidence = sequence_pairs(reference[left], moving[right])
            if evidence["ambiguous"]:
                raise ValueError(
                    "Observed sequence alignment is ambiguous; supply explicit residue anchors."
                )
            if evidence["identity"] < options.minimum_identity:
                raise ValueError("Observed chain identity is below the requested threshold.")
            pairs.extend(evidence["pairs"])
            identities.append((evidence["aligned_count"], evidence["identical_count"]))
        identity = (
            sum(identical for _, identical in identities) / sum(n for n, _ in identities)
            if identities and sum(n for n, _ in identities)
            else 0.0
        )
        method = "unique_observed_ca_sequence_alignment"
    if len(pairs) < options.minimum_pairs:
        raise ValueError("Too few matching C-alpha anchors for the declared alignment budget.")
    coverage = len(pairs) / max(sum(map(len, reference.values())), sum(map(len, moving.values())))
    if coverage < options.minimum_coverage or identity < options.minimum_identity:
        raise ValueError("Alignment coverage/identity does not meet the requested thresholds.")
    return pairs, {
        "method": method,
        "pair_count": len(pairs),
        "identity": identity,
        "coverage": coverage,
    }
