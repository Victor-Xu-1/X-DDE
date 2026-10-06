"""Streaming count ingestion uses observed columns and cycle identities, never invented zeros."""

import csv
import json
import sqlite3
from decimal import Decimal, InvalidOperation

from platformnative_io import input_file, progress, readonly_database, source_result, text_lines


def count(value):
    try:
        number = Decimal(str(value))
        if (
            not number.is_finite()
            or number < 0
            or number != number.to_integral_value()
            or number > 2**53 - 1
        ):
            raise ValueError(
                "Counts must be nonnegative exact integers, not missing cells or normalized scores."
            )
        return int(number)
    except InvalidOperation as exc:
        raise ValueError("Counts must be observed integer counts, not missing values.") from exc


def imported_rows(request):
    file, _ = input_file(request, "counts")
    options = request["payload"]
    csv.field_size_limit(1024**2)
    reader = csv.DictReader(
        text_lines(file, options["expanded_bytes"]), delimiter=options["delimiter"]
    )
    columns = [sample["column"] for sample in options["samples"]]
    required = [options["id_column"], *columns, *options["cycle_columns"]]
    header = reader.fieldnames or []
    if len(header) != len(set(header)) or any(column not in header for column in required):
        raise ValueError(
            "Select the exact member, count and optional cycle columns in this count table."
        )
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("A DEL count row differs from its declared table columns.")
        identifier = row[options["id_column"]].strip()
        if not identifier or len(identifier) > 240 or any(ord(char) < 32 for char in identifier):
            raise ValueError("DEL member identities must be explicit bounded text values.")
        cycles = [row[column].strip() for column in options["cycle_columns"]]
        if any(not value or len(value) > 100 for value in cycles):
            raise ValueError("An observed building-block identity is missing or excessive.")
        smiles = row.get(options["smiles_column"], "").strip()
        if len(smiles) > 20000:
            raise ValueError(
                "The supplied DEL member structure exceeds its scientific record budget."
            )
        yield identifier, "", cycles, smiles, [count(row[column]) for column in columns]


def native_rows(request):
    root, _ = source_result(request)
    database = readonly_database(root / "counts.sqlite")
    options = request["payload"]
    column = {"reads": "raw", "unique_umi": "unique_umi", "corrected_umi": "corrected_umi"}[
        options["count_unit"]
    ]
    names = [sample["column"] for sample in options["samples"]]
    try:
        existing = {row[0] for row in database.execute("SELECT DISTINCT sample FROM counts")}
        if set(names) - existing:
            raise ValueError("Choose sample names actually present in the completed count matrix.")
        if database.execute(
            "SELECT 1 FROM counts WHERE " + column + " IS NULL AND raw>0 LIMIT 1"
        ).fetchone():
            raise ValueError(
                "The selected UMI count unit is unavailable; use the actual raw-read evidence."
            )
        clauses = [
            f"COALESCE(MAX(CASE WHEN c.sample=? THEN c.{column} END),0) AS c{index}"
            for index in range(len(names))
        ]
        query = (
            "SELECT m.id,m.library,m.cycles,m.smiles,"
            + ",".join(clauses)
            + (" FROM members m LEFT JOIN counts c ON c.member=m.id GROUP BY m.id ORDER BY m.id")
        )
        for row in database.execute(query, names):
            yield (
                row["id"],
                row["library"],
                json.loads(row["cycles"]),
                row["smiles"] or "",
                [row[f"c{index}"] for index in range(len(names))],
            )
    finally:
        database.close()


def prepare_counts(request):
    options = request["payload"]
    samples = options["samples"]
    database = sqlite3.connect("/output/analysis.sqlite")
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA cache_size=-16384")
    columns = ",".join(f"c{index} INTEGER NOT NULL" for index in range(len(samples)))
    database.execute(
        "CREATE TABLE members (ordinal INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,"
        "library TEXT,cycles TEXT,smiles TEXT," + columns + ")"
    )
    placeholders = ",".join("?" for _ in range(5 + len(samples)))
    totals, observed = [0] * len(samples), 0
    rows = imported_rows(request) if request["inputs"] else native_rows(request)
    try:
        for ordinal, (identifier, library, cycles, smiles, values) in enumerate(rows):
            if ordinal >= options["max_members"]:
                raise ValueError("This count table exceeds the confirmed observed-member budget.")
            database.execute(
                "INSERT INTO members VALUES (" + placeholders + ")",
                (ordinal, identifier, library, json.dumps(cycles), smiles, *values),
            )
            totals = [total + value for total, value in zip(totals, values, strict=True)]
            if any(total > 2**53 - 1 for total in totals):
                raise ValueError("Count depths exceed exact floating-point statistical precision.")
            observed += 1
            if observed % 5000 == 0:
                database.commit()
                progress("Reading observed DEL count matrices", observed)
        if not observed or not any(totals):
            raise ValueError("This count matrix contains no observed nonzero counts.")
        database.commit()
    except (ValueError, sqlite3.Error):
        database.close()
        raise
    return database, totals, observed
