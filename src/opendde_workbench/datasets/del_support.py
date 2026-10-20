"""Observed target-sample consistency is a prioritization gate, not biological replication."""

import numpy as np


def supporting_samples(counts, comparison, depths, options):
    selected = comparison["selected_columns"]
    available = [index for index in selected if depths[index] > 0]
    required = options.get("minimum_supporting_samples", 1)
    if len(available) < required:
        raise ValueError("Too few target samples have sequenced depth for the support requirement.")
    reference = counts[:, comparison["reference_columns"]].sum(axis=1)
    supported = np.zeros(len(counts), dtype=np.int64)
    for index in available:
        # The same global-depth-normalized DELi ratio used by the pooled analysis.
        score = (
            (comparison["reference_depth"] / depths[index])
            * (counts[:, index] + 3 / 8)
            / (reference + 3 / 8)
        )
        supported += (counts[:, index] > 0) & (score >= options["minimum_enrichment"])
    return supported
