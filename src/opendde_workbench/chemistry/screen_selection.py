"""Bounded library selection with explicit chemical, scaffold and count reasons."""


def select_indices(rows, fingerprints, options):
    eligible = [row for row in rows if row["eligible"]]
    if options.mode == "similarity":
        eligible.sort(key=lambda row: (-row["similarity"], row["record"]))
    if options.mode == "diversity" and eligible:
        from rdkit.SimDivFilters.rdSimDivPickers import MaxMinPicker

        chosen = MaxMinPicker().LazyBitVectorPick(
            [fingerprints[row["record"]] for row in eligible],
            len(eligible),
            min(options.max_selected, len(eligible)),
            seed=options.seed,
        )
        return [eligible[i]["record"] for i in chosen]
    if options.mode == "scaffold":
        families = {}
        for row in eligible:
            families.setdefault(row["scaffold_group"], []).append(row["record"])
        # One from each family before a second from any family. Within a family,
        # preserve input order rather than imply an uncomputed activity ranking.
        chosen = [
            records[round_index]
            for round_index in range(options.per_scaffold)
            for records in families.values()
            if round_index < len(records)
        ]
        return chosen[: options.max_selected]
    return [row["record"] for row in eligible[: options.max_selected]]


def annotate_unselected(rows, selected, options):
    counts = {}
    if options.mode == "scaffold":
        for record in selected:
            group = rows[record]["scaffold_group"]
            counts[group] = counts.get(group, 0) + 1
    for row in rows:
        if row["eligible"] and not row["selected"]:
            if (
                options.mode == "scaffold"
                and counts.get(row["scaffold_group"], 0) >= options.per_scaffold
            ):
                row.update(
                    eligible=False,
                    reason_code="scaffold_quota",
                    reason="Requested representatives for this scaffold are already selected.",
                )
            else:
                row.update(
                    reason_code="count_budget",
                    reason="Eligible but outside the selected output count budget.",
                )
