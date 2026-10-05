"""Held-out regression evidence from native predictions and native scaffold-split records."""

import csv
import math

from native_io import csv_file, metric


def regression_evidence(test, train, predictions, unit):
    def read(file):
        with file.open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))

    expected, observed, training = read(test), read(predictions), read(train)
    if not expected or len(expected) != len(observed):
        raise ValueError("Native held-out predictions do not match the exported test split.")
    train_smiles = {row["smiles"] for row in training}
    points = []
    for truth, prediction in zip(expected, observed, strict=True):
        if truth["smiles"] != prediction["smiles"] or truth["smiles"] in train_smiles:
            raise ValueError("Held-out chemical row correspondence or training isolation failed.")
        actual, predicted = float(truth["activity"]), float(prediction["activity"])
        if not all(math.isfinite(v) for v in (actual, predicted)):
            raise ValueError("Held-out property measurements/predictions must be finite.")
        points.append({"smiles": truth["smiles"], "observed": actual, "predicted": predicted})
    errors = [p["predicted"] - p["observed"] for p in points]
    method = "Chemprop best exported model; held-out scaffold split"
    metrics = [
        metric(
            "Test RMSE",
            math.sqrt(sum(e * e for e in errors) / len(errors)),
            unit,
            method,
            "validation",
        ),
        metric("Test MAE", sum(abs(e) for e in errors) / len(errors), unit, method, "validation"),
        metric("Test molecules", len(points), "count", method, "validation"),
    ]
    mean = sum(p["observed"] for p in points) / len(points)
    variance = sum((p["observed"] - mean) ** 2 for p in points)
    if variance > 0:
        metrics.append(
            metric(
                "Test R²",
                1 - sum(e * e for e in errors) / variance,
                "dimensionless",
                method,
                "validation",
            )
        )
    csv_file(
        "held-out-predictions.csv",
        ["SMILES", "Observed", "Predicted", "Unit"],
        [[p["smiles"], p["observed"], p["predicted"], unit] for p in points],
    )
    return metrics, points
