"""A bounded researcher-readable report, separate from immutable molecular output."""

import csv
import hashlib


def write_report(rows, output):
    file = output / "library-report.csv"
    with file.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "Input record",
                "Selected",
                "SMILES",
                "MW",
                "LogP",
                "Structural alerts",
                "Scaffold family",
                "Selection reason",
            ]
        )
        for row in rows:
            descriptors = row["descriptors"] or {}
            alerts = row["structural_alerts"]
            writer.writerow(
                [
                    row["record"] + 1,
                    row["selected"],
                    descriptors.get("smiles", ""),
                    descriptors.get("mw", ""),
                    descriptors.get("logp", ""),
                    "Not evaluated"
                    if alerts is None
                    else "; ".join(item["catalogue"] + ": " + item["rule"] for item in alerts)
                    or "No rule matches",
                    "" if row["scaffold_group"] is None else row["scaffold_group"] + 1,
                    row["reason"] or "Selected",
                ]
            )
    return file.name, hashlib.sha256(file.read_bytes()).hexdigest()
