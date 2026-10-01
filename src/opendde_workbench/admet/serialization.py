"""Stable endpoint order and safe text cells in downloadable prediction tables."""

import csv
from io import StringIO


def rows_csv(rows, endpoints):
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["record", "name", "smiles", "status", "reason", *endpoints])
    for row in rows:
        name = row["name"]
        if name.lstrip().startswith(("=", "+", "-", "@")):
            name = "'" + name
        writer.writerow(
            [
                row["record"] + 1,
                name,
                row["smiles"] or "",
                row["status"],
                row["reason"] or "",
                *[row["predictions"].get(key, "") for key in endpoints],
            ]
        )
    return output.getvalue().encode("utf-8")
