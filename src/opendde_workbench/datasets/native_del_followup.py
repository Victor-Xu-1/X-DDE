"""Record user-supplied follow-up measurements separately from enrichment and model scores."""

import csv
import importlib.metadata
import math
import sqlite3

from platformnative_io import (
    finish,
    input_file,
    readonly_database,
    source_result,
    text_lines,
    write_csv,
)


def run(request):
    root, _ = source_result(request)
    original = readonly_database(root / "analysis.sqlite")
    source, _ = input_file(request, "counts")
    options = request["payload"]
    reader = csv.DictReader(
        text_lines(source, options["expanded_bytes"]), delimiter=options["delimiter"]
    )
    expected = [options["followup_id_column"], options["followup_value_column"]]
    if any(column not in (reader.fieldnames or []) for column in expected):
        raise ValueError(
            "Choose the actual member and measured-value columns for the follow-up results."
        )
    output = sqlite3.connect("/output/followup.sqlite")
    output.execute(
        "CREATE TABLE measurements (record INTEGER PRIMARY KEY,member TEXT,endpoint TEXT,"
        "unit TEXT,value REAL,matched INTEGER,qualifier TEXT,relation TEXT)"
    )
    rows = matched = 0
    try:
        for ordinal, row in enumerate(reader):
            if ordinal >= options["max_members"]:
                raise ValueError("The follow-up table exceeds its explicit row budget.")
            identifier = row[options["followup_id_column"]].strip()
            reported = row[options["followup_value_column"]].strip()
            qualitative = options["followup_unit"] == "qualitative"
            value = None if qualitative else float(reported)
            if (
                not identifier
                or len(identifier) > 240
                or (value is not None and (not math.isfinite(value) or value < 0))
            ):
                raise ValueError(
                    "Measured member identifiers and endpoint values must be explicit and finite."
                )
            if options["followup_unit"] == "percent" and value > 100:
                raise ValueError("Inhibition measurements must be between 0 and 100 percent.")
            if qualitative and (
                not reported or len(reported) > 240 or any(ord(char) < 32 for char in reported)
            ):
                raise ValueError(
                    "A qualitative report needs bounded text, not an invented numeric value."
                )
            column = options.get("followup_relation_column", "")
            relation = row.get(column, "=").strip() if column else "="
            if relation not in {"=", "<", "<=", ">", ">=", "~"}:
                raise ValueError("Choose an explicit supported reported-measurement relation.")
            exists = bool(
                original.execute("SELECT 1 FROM members WHERE id=?", (identifier,)).fetchone()
            )
            output.execute(
                "INSERT INTO measurements VALUES (?,?,?,?,?,?,?,?)",
                (
                    ordinal,
                    identifier,
                    options["followup_endpoint"],
                    options["followup_unit"],
                    value,
                    int(exists),
                    reported if qualitative else "",
                    relation,
                ),
            )
            matched += exists
            rows += 1
        if not rows:
            raise ValueError("This follow-up table contains no reported measurements.")
        output.commit()
        write_csv(
            "/output/followup-measurements.csv",
            [
                "record",
                "member",
                "reported_endpoint",
                "reported_unit",
                "reported_value",
                "matched_prior_member",
                "reported_text",
                "reported_relation",
            ],
            output.execute("SELECT * FROM measurements ORDER BY record"),
        )
    finally:
        original.close()
        output.close()
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "analysis",
        {
            "followup.sqlite": "reported_followup_measurements",
            "followup-measurements.csv": "reported_followup_values",
        },
        counts={"reported": rows, "matched": matched, "unmatched": rows - matched},
        metadata={
            "endpoint": options["followup_endpoint"],
            "unit": options["followup_unit"],
            "source": "user_supplied_measurements; not independently validated experiments",
            "reported_source": options.get("followup_source", ""),
            "analysis": request["sources"][0],
        },
    )
