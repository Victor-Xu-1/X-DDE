"""UMI completeness follows the exact library schema, separately from member decoding."""

from collections import Counter

STATES = ("complete", "truncated", "too_long", "ambiguous", "missing", "not_defined")


def expected_lengths(definition):
    return {
        name: len(library["barcode_schema"]["umi"]["tag"])
        if "umi" in library["barcode_schema"]
        else None
        for name, library in definition["libraries"].items()
    }


def umi_status(umi, expected):
    if expected is None:
        return "not_defined"
    if not umi:
        return "missing"
    if set(umi) - set("ACGT"):
        return "ambiguous"
    if len(umi) != expected:
        return "truncated" if len(umi) < expected else "too_long"
    return "complete"


def summary(lengths, reads, records):
    return {
        "schema_version": 1,
        "scope": "within_sample_library_and_compound",
        "expected_lengths": lengths,
        "reads_by_status": {key: reads[key] for key in STATES},
        "records_by_status": {key: records[key] for key in STATES},
    }


def read_summary(value, decoded_reads, grouped_records):
    """Absent historical assessment stays unknown; contradictory claims are rejected."""
    if value is None:
        return None
    if not isinstance(value, dict) or (
        type(value.get("schema_version")) is not int
        or value.get("schema_version") != 1
        or value.get("scope") != "within_sample_library_and_compound"
    ):
        raise ValueError("The decoded result has an unsupported UMI completeness assessment.")
    lengths = value.get("expected_lengths")
    if (
        not isinstance(lengths, dict)
        or not lengths
        or any(
            not isinstance(name, str)
            or not name
            or not (length is None or type(length) is int and 1 <= length <= 100)
            for name, length in lengths.items()
        )
    ):
        raise ValueError("The decoded UMI lengths do not identify their original libraries.")
    for field, total in (
        ("reads_by_status", decoded_reads),
        ("records_by_status", grouped_records),
    ):
        rows = value.get(field)
        if (
            not isinstance(rows, dict)
            or set(rows) != set(STATES)
            or any(type(count) is not int or count < 0 for count in rows.values())
            or sum(rows.values()) != total
        ):
            raise ValueError("UMI completeness counts do not reconcile with decoded evidence.")
    if any(
        value["records_by_status"][key] > value["reads_by_status"][key]
        or bool(value["records_by_status"][key]) != bool(value["reads_by_status"][key])
        for key in STATES
    ):
        raise ValueError("UMI observations exceed the reads supporting them.")
    return value


def database_summary(database, lengths):
    reads, records = Counter(), Counter()
    for state, count, groups in database.execute(
        "SELECT umi_status,SUM(count),COUNT(*) FROM reads GROUP BY umi_status"
    ):
        if state not in STATES:
            raise ValueError("Unknown UMI completeness state in decoded evidence.")
        reads[state], records[state] = count, groups
    return summary(lengths, reads, records)


def counting_summary(metadata, counts, method):
    integrity = read_summary(
        metadata.get("umi_integrity"), counts["decoded_reads"], counts.get("distinct_umi_records")
    )
    if method != "raw":
        if integrity is None:
            raise ValueError(
                "UMI completeness was not assessed for this decoding result; "
                "decode again with the original library or choose explicit raw-read counts."
            )
        if integrity["reads_by_status"]["not_defined"]:
            raise ValueError("This library has no defined UMI; choose explicit raw-read counts.")
    return integrity
