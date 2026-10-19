"""Cross-check chain roles, observed coverage and native inventories before presentation."""

import math


def same_ratio(value, numerator, denominator):
    return math.isclose(value, numerator / denominator, rel_tol=1e-10, abs_tol=1e-12)


def verify_evidence(result):
    if result.versions != {"biopython": "1.88", "numpy": "1.26.4", "dockq": "2.1.3"}:
        raise ValueError("Comparison report differs from its reviewed native library versions.")
    options = result.options
    mappings = [("target", p) for p in options.target_mapping] + [
        ("partner", p) for p in options.partner_mapping
    ]
    expected = [(role, pair.reference, pair.moving) for role, pair in mappings]
    if [
        (r.role, r.reference_chain, r.moving_chain) for r in result.chain_correspondence
    ] != expected:
        raise ValueError("Comparison report changes the selected target/partner chain mapping.")
    for side, inspection, model in zip(
        ("reference", "moving"),
        result.inspections,
        (options.reference_model, options.moving_model),
        strict=True,
    ):
        quality = inspection.structure
        chains = {getattr(pair, side) for _, pair in mappings}
        if quality.selected_model_index != model or set(quality.selected_chains) != chains:
            raise ValueError("Comparison quality record differs from its selected model/chains.")
        polymer = inspection.polymer
        if set(polymer.chain_residue_counts) != chains or (
            polymer.polymer_residues != quality.observed_residue_count
        ):
            raise ValueError(
                "Polymer inventory differs from the selected structural quality record."
            )
        observed = {c.chain: c.observed_ca_count for c in quality.protein_chains}
        if set(observed) != chains or any(
            count > polymer.chain_residue_counts[chain] for chain, count in observed.items()
        ):
            raise ValueError("Observed C-alpha chains differ from the selected polymers.")
        for record in result.chain_correspondence:
            if getattr(record, side + "_observed") != observed[getattr(record, side + "_chain")]:
                raise ValueError("Correspondence coverage differs from observed C-alpha counts.")
    for match in result.chain_correspondence:
        rows = [
            r
            for r in result.geometry.residue_displacements
            if (r.role, r.reference.chain, r.moving.chain)
            == (match.role, match.reference_chain, match.moving_chain)
        ]
        identical = sum(r.reference_letter == r.moving_letter for r in rows)
        if len(rows) != match.matched or identical != match.identical:
            raise ValueError("Matched/mutated residue inventory differs from correspondence.")
        if (
            not all(
                (
                    same_ratio(match.identity, identical, match.matched),
                    same_ratio(
                        match.coverage,
                        match.matched,
                        max(match.reference_observed, match.moving_observed),
                    ),
                    same_ratio(match.reference_coverage, match.matched, match.reference_observed),
                    same_ratio(match.moving_coverage, match.matched, match.moving_observed),
                )
            )
            or match.identity < options.minimum_identity
            or match.coverage < options.minimum_coverage
        ):
            raise ValueError("Comparison coverage/identity differs from the declared evaluation.")
        for side in ("reference", "moving"):
            matched = {getattr(r, side) for r in rows}
            unmatched = getattr(match, "unmatched_" + side)
            if (
                len(set(unmatched)) != len(unmatched)
                or matched & set(unmatched)
                or len(matched) + len(unmatched) != getattr(match, side + "_observed")
                or any(r.chain != getattr(match, side + "_chain") for r in unmatched)
            ):
                raise ValueError("Missing-observation inventory is incomplete or duplicated.")
    geometry = result.geometry
    if geometry.matched_target_ca < options.minimum_target_pairs or (
        geometry.matched_partner_ca < options.minimum_partner_pairs
    ):
        raise ValueError("Comparison contains fewer evaluated residues than requested.")
    if sum(row.matched for row in result.chain_correspondence) != len(
        geometry.residue_displacements
    ):
        raise ValueError("Comparison includes residues outside the selected correspondence.")
    interfaces = result.native_quality.interfaces
    if [(row.target, row.partner) for row in interfaces] != [
        (a, b) for a in options.target_mapping for b in options.partner_mapping
    ]:
        raise ValueError("Native report does not cover each selected cross-role interface once.")
    for row in interfaces:
        counts = result.inspections[0].polymer.chain_residue_counts
        if row.metrics and (row.metrics.len1, row.metrics.len2) != (
            counts[row.target.reference],
            counts[row.partner.reference],
        ):
            raise ValueError("Native receptor assignment differs from observed reference polymers.")
        for inventory in row.correspondence:
            moving_counts = result.inspections[1].polymer.chain_residue_counts
            if len(inventory.matched_identical) > min(
                counts[inventory.reference_chain], moving_counts[inventory.moving_chain]
            ):
                raise ValueError("Native correspondence exceeds observed polymer counts.")
