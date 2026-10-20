"""Account for measured native checks without converting missing context to a pass."""

import math

CONTEXT_METRICS = {
    "protein-ligand_maximum_distance": ("smallest_distance_protein", "distance"),
    "minimum_distance_to_protein": ("smallest_distance_protein", "distance"),
    **{
        f"minimum_distance_to_{key}": (f"smallest_distance_{key}", "distance")
        for key in ("organic_cofactors", "inorganic_cofactors", "waters")
    },
    **{
        f"volume_overlap_with_{key}": (f"volume_overlap_{key}", "overlap")
        for key in ("protein", "organic_cofactors", "inorganic_cofactors", "waters")
    },
}
FEATURE_COUNTS = {
    "bond_lengths": "number_bonds",
    "bond_angles": "number_angles",
    "internal_steric_clash": "number_noncov_pairs",
    "aromatic_ring_flatness": "number_aromatic_rings_checked",
    "non-aromatic_ring_non-flatness": "number_non-aromatic_rings_checked",
    "double_bond_flatness": "number_double_bonds_checked",
}
POSE_GATE_CHECKS = (
    "mol_pred_loaded",
    "mol_cond_loaded",
    "sanitization",
    "inchi_convertible",
    "all_atoms_connected",
    "no_radicals",
    "bond_lengths",
    "bond_angles",
    "internal_steric_clash",
    "internal_energy",
    "protein-ligand_maximum_distance",
    "minimum_distance_to_protein",
    "volume_overlap_with_protein",
)


def assess_checks(result):
    assessed = []
    for row in result.checks:
        outcome = row.outcome
        if outcome == "pass" and (context := CONTEXT_METRICS.get(row.id)):
            value = result.metrics.get(context[0])
            if (
                "protein" not in result.inputs
                or value is None
                or not math.isfinite(value)
                or value < 0
                or context[1] == "overlap"
                and value > 1
            ):
                outcome = "unassessed"
        if outcome == "pass" and (metric := FEATURE_COUNTS.get(row.id)):
            value = result.metrics.get(metric)
            if (
                value is None
                or not math.isfinite(value)
                or value < 0
                or value > 2**53 - 1
                or value != int(value)
            ):
                outcome = "unassessed"
            elif value == 0:
                outcome = "not_applicable"
        assessed.append({"id": row.id, "native_outcome": row.outcome, "assessment": outcome})
    return assessed
