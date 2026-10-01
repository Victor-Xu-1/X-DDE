"""Preserve native missing tests instead of interpreting NaN or strings as a pass."""

import math


def summarize(checks):
    if any(row["outcome"] == "fail" for row in checks):
        return "fails"
    if any(row["outcome"] == "unavailable" for row in checks):
        return "incomplete"
    return "passes"


def normalize(table, names):
    import numpy as np

    if len(table) != 1 or not table.columns.is_unique:
        raise ValueError("Native quality report did not preserve one selected molecular record.")
    row = table.iloc[0]
    checks = []
    for name in names:
        value = row.get(name)
        checks.append(
            {
                "id": name,
                "outcome": ("pass" if bool(value) else "fail")
                if isinstance(value, (bool, np.bool_))
                else "unavailable",
            }
        )
    metrics = {}
    for name, value in row.items():
        if (
            name not in names
            and isinstance(value, (int, float, np.integer, np.floating))
            and not isinstance(value, (bool, np.bool_))
            and math.isfinite(float(value))
        ):
            if not isinstance(name, str) or len(name) > 100:
                raise ValueError("Native diagnostic column identity is invalid.")
            metrics[name] = float(value)
    return {"classification": summarize(checks), "checks": checks, "metrics": metrics}
