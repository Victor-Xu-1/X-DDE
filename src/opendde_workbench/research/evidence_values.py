"""Explicit unit arithmetic, never an inferred endpoint or fabricated measurement."""

import hashlib
import json
import math
from collections import defaultdict
from decimal import Decimal, InvalidOperation

CONCENTRATION_ENDPOINTS = {"KD", "Ki", "IC50", "EC50", "DC50"}
NM_FACTORS = {"M": 1e9, "mM": 1e6, "uM": 1e3, "µM": 1e3, "μM": 1e3, "nM": 1.0, "pM": 1e-3}


def number(text):
    try:
        decimal = Decimal(text.strip())
        result = float(decimal)
    except (ValueError, InvalidOperation, OverflowError) as exc:
        raise ValueError("Reported numeric values must be explicit finite numbers.") from exc
    if not decimal.is_finite() or not math.isfinite(result) or (decimal != 0 and result == 0):
        raise ValueError("Reported numeric values must be finite.")
    return result


def normalize(endpoint, unit, value):
    if endpoint == "qualitative":
        if unit != "text":
            raise ValueError("Qualitative observations require unit text.")
        if not value.strip() or len(value) > 240 or any(ord(c) < 32 for c in value):
            raise ValueError("Provide bounded qualitative text, not a numeric surrogate.")
        return None, None, "text"
    numeric = number(value)
    if endpoint in CONCENTRATION_ENDPOINTS:
        if unit not in NM_FACTORS or numeric < 0:
            raise ValueError("Binding or potency observations require a nonnegative molar unit.")
        normalized = numeric * NM_FACTORS[unit]
        if not math.isfinite(normalized) or (numeric > 0 and normalized == 0):
            raise ValueError("Reported concentration is outside the supported numeric range.")
        return numeric, normalized, "nM"
    if endpoint in {"Dmax", "inhibition"} and unit != "%":
        raise ValueError("Dmax and inhibition observations require explicit percent units.")
    if endpoint == "expression" and unit not in {"mg/L", "g/L", "relative"}:
        raise ValueError("Expression requires mg/L, g/L or an explicitly relative measurement.")
    return numeric, numeric, unit


def group_digest(endpoint, unit, conditions):
    return hashlib.sha256(
        json.dumps(
            {"endpoint": endpoint, "unit": unit, "conditions": conditions.model_dump(mode="json")},
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def summaries(document):
    grouped = defaultdict(list)
    for row in document.observations:
        grouped[(row.comparison_group, row.compound)].append(row)
    results = []
    for (group, compound), rows in sorted(grouped.items()):
        exact = [
            row.normalized_value
            for row in rows
            if row.relation == "=" and row.normalized_value is not None
        ]
        lower = [row.normalized_value for row in rows if row.relation in {">", ">="}]
        upper = [row.normalized_value for row in rows if row.relation in {"<", "<="}]
        lower = [value for value in lower if value is not None]
        upper = [value for value in upper if value is not None]
        bounds_conflict = bool(lower and upper and max(lower) > min(upper))
        if lower and upper and max(lower) == min(upper):
            point = max(lower)
            bounds_conflict = any(
                row.normalized_value == point and row.relation in {"<", ">"} for row in rows
            )
        results.append(
            {
                "comparison_group": group,
                "compound": compound,
                "endpoint": rows[0].endpoint,
                "unit": rows[0].normalized_unit,
                "conditions": rows[0].conditions.model_dump(mode="json"),
                "reported_count": len(rows),
                "exact_count": len(exact),
                "censored_count": sum(row.relation not in {"=", "~"} for row in rows),
                "median_if_exact": exact_median(exact),
                "incompatible_reported_bounds": bounds_conflict,
                "molecule": rows[0].molecule.model_dump(mode="json") if rows[0].molecule else None,
            }
        )
    return results


def exact_median(values):
    if not values:
        return None
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return float((Decimal(str(ordered[midpoint - 1])) + Decimal(str(ordered[midpoint]))) / 2)
