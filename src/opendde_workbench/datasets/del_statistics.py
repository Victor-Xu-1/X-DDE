"""DELi's published MLE ratio with global depths; count-only posterior intervals stay explicit."""

import numpy as np
from scipy.stats import betaprime


def enrichment(selection, reference, selection_depth, reference_depth):
    if selection_depth <= 0 or reference_depth <= 0:
        raise ValueError(
            "Enrichment requires nonzero observed depths in both confirmed study groups."
        )
    selection, reference = np.asarray(selection), np.asarray(reference)
    if (
        not np.isfinite(selection).all()
        or not np.isfinite(reference).all()
        or np.any(selection < 0)
        or np.any(reference < 0)
    ):
        raise ValueError("Enrichment inputs must be finite nonnegative observed counts.")
    ratio = reference_depth / selection_depth
    mle = ratio * (selection + 3 / 8) / (reference + 3 / 8)
    lower = ratio * betaprime.ppf(0.025, selection + 3 / 8, reference + 3 / 8)
    upper = ratio * betaprime.ppf(0.975, selection + 3 / 8, reference + 3 / 8)
    return mle, lower, upper


def groups(options, totals):
    values = {}
    for index, sample in enumerate(options["samples"]):
        values.setdefault(sample["group"], []).append(index)
    comparisons = []
    for item in options["comparisons"]:
        selected, reference = values[item["selection"]], values[item["reference"]]
        selection_depth = sum(totals[index] for index in selected)
        reference_depth = sum(totals[index] for index in reference)
        if not selection_depth or not reference_depth:
            raise ValueError(
                "A selected comparison has zero sequenced depth; revise the study design."
            )
        comparisons.append(
            {
                **item,
                "selected_columns": selected,
                "reference_columns": reference,
                "selection_depth": selection_depth,
                "reference_depth": reference_depth,
            }
        )
    return values, comparisons


def evidence(selection, reference, normalized_replicates, options):
    notes = []
    if selection < options["minimum_counts"]:
        notes.append("low_selection_count")
    if reference == 0:
        notes.append("reference_not_observed; not proven_absent")
    values = np.asarray(normalized_replicates)
    if len(values) < 2:
        cv = None
        notes.append("single_replicate; biological_reproducibility_unassessed")
    else:
        cv = float(values.std(ddof=1) / values.mean()) if values.mean() else None
        if cv is not None and cv > 1:
            notes.append("replicate_variation")
    return cv, notes
