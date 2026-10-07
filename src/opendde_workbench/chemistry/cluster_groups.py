"""Deterministic complete-link clusters preserve unknown pairs and source representatives."""

import math


def cluster_groups(rows, pairs, options):
    lookup = {(p["left"], p["right"]): p for p in pairs}
    keys = {r["index"]: (r["selection"]["step_id"], r["selection"]["record"]) for r in rows}

    def distance(left, right):
        pair = lookup[tuple(sorted((left, right)))]
        if not pair["same_chemical_graph"]:
            return None
        metrics = []
        if options.criterion in {"geometry", "both"}:
            value = pair["rmsd_angstrom"]
            if value is None or value > options.maximum_rmsd_angstrom:
                return None
            metrics.append(value / options.maximum_rmsd_angstrom)
        if options.criterion in {"contacts", "both"}:
            value = pair["contact_jaccard"]
            if value is None or value < options.minimum_contact_jaccard:
                return None
            metrics.append(1.0 - value)
        return max(metrics)

    groups = [(i,) for i in sorted(keys, key=keys.get)]
    while True:
        choices = []
        for i, left in enumerate(groups):
            for j in range(i + 1, len(groups)):
                right = groups[j]
                values = [distance(a, b) for a in left for b in right]
                if any(value is None for value in values):
                    continue
                merged = tuple(sorted((*left, *right), key=keys.get))
                choices.append((max(values), tuple(keys[k] for k in merged), i, j, merged))
        if not choices:
            break
        _, _, i, j, merged = min(choices)
        groups = [g for k, g in enumerate(groups) if k not in {i, j}] + [merged]
        groups.sort(key=lambda g: tuple(keys[k] for k in g))
    result = []
    for group in groups:
        # A medoid is an original pose. No new averaged coordinates are invented.
        def cost(index, members=group):
            return math.fsum(distance(index, other) for other in members if other != index)

        representative = min(group, key=lambda index: (cost(index), keys[index]))
        result.append(
            {
                "id": len(result) + 1,
                "members": list(group),
                "representative": representative,
                "sample_count": len(group),
            }
        )
    return result
