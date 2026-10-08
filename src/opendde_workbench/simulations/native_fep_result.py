"""Native MBAR diagnostics; preserve leg direction and independent-repeat uncertainty."""

import math


def kcal(value):
    from openff.units import unit

    number = float(value.to(unit.kilocalorie_per_mole).m)
    if not math.isfinite(number):
        raise ValueError("FEP analysis returned a nonfinite estimate.")
    return number


def summarize(result):
    individual = result.get_individual_estimates()
    # A single repeat has no empirical repeat variance. Keep its native MBAR error,
    # never mistake OpenFE's zero repeat spread for zero statistical uncertainty.
    mbar = [kcal(error) for _, error in individual]
    spread = kcal(result.get_uncertainty()) if len(individual) > 1 else None
    uncertainty = max(sum(error * error for error in mbar) ** 0.5 / len(mbar), spread or 0)
    overlap = [item["matrix"].tolist() for item in result.get_overlap_matrices()]
    convergences = []
    for item in result.get_forward_and_reverse_energy_analysis():
        if item is None:
            convergences.append(None)
        else:
            convergences.append(
                {
                    "fractions": item["fractions"].tolist(),
                    "forward": [kcal(v) for v in item["forward_DGs"]],
                    "reverse": [kcal(v) for v in item["reverse_DGs"]],
                    "forward_error": [kcal(v) for v in item["forward_dDGs"]],
                    "reverse_error": [kcal(v) for v in item["reverse_dDGs"]],
                }
            )
    return {
        "delta_g_kcal_mol": kcal(result.get_estimate()),
        "uncertainty_kcal_mol": uncertainty,
        "repeat_spread_kcal_mol": spread,
        "individual": [{"delta_g": kcal(v), "mbar_error": kcal(e)} for v, e in individual],
        "overlap": overlap,
        "convergence": convergences,
    }


def combine(complex_leg, solvent_leg):
    delta = complex_leg["delta_g_kcal_mol"] - solvent_leg["delta_g_kcal_mol"]
    uncertainty = math.hypot(
        complex_leg["uncertainty_kcal_mol"], solvent_leg["uncertainty_kcal_mol"]
    )
    matrices = complex_leg["overlap"] + solvent_leg["overlap"]
    minimum = min(
        min(matrix[i][i + 1], matrix[i + 1][i])
        for matrix in matrices
        for i in range(len(matrix) - 1)
    )
    convergence_available = all(
        item is not None for leg in (complex_leg, solvent_leg) for item in leg["convergence"]
    )
    return {
        "delta_delta_g_kcal_mol": delta,
        "uncertainty_kcal_mol": uncertainty,
        "minimum_adjacent_overlap": minimum,
        "quality": "review_required"
        if minimum < 0.03 or not convergence_available or uncertainty > 1
        else "diagnostics_available",
        "legs": {"complex": complex_leg, "solvent": solvent_leg},
    }
