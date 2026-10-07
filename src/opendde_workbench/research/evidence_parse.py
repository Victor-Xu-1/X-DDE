"""Bounded CSV parsing retains every source row and refuses ambiguous headers."""

import csv
import io

from .evidence_contracts import AssayConditions, EvidenceObservation, ReportedUncertainty
from .evidence_values import group_digest, normalize, number

MAX_BYTES = 16 * 1024**2
MAX_ROWS = 1000


def parse_observations(content, request):
    reader = csv_reader(content, request.delimiter)
    try:
        names = reader.fieldnames or []
        selected = [name for name in request.columns.model_dump().values() if name]
        if not set(selected) <= set(names):
            raise ValueError("Select the actual table columns before importing observations.")
        observations, compounds, seen_replicates = [], set(), set()
        for index, raw in enumerate(reader):
            if index >= MAX_ROWS:
                raise ValueError(
                    "Split this table into imports of at most 1000 reported observations."
                )
            if None in raw or any(value is None for value in raw.values()):
                raise ValueError(f"Source row {reader.line_num} has a missing or extra column.")
            if any(
                len(value) > 2000 or any(ord(c) < 32 and c not in "\t\n\r" for c in value)
                for value in raw.values()
            ):
                raise ValueError("Experimental cells exceed the bounded text policy.")

            def cell(field, default="", raw=raw):
                column = getattr(request.columns, field)
                return raw[column].strip() if column else default

            compound = cell("compound")
            if not compound or len(compound) > 240 or any(ord(c) < 32 for c in compound):
                raise ValueError(f"Source row {reader.line_num} needs a bounded compound identity.")
            endpoint, unit = cell("endpoint", request.endpoint), cell("unit", request.unit)
            numeric, normalized, normalized_unit = normalize(endpoint, unit, cell("value"))
            relation = cell("relation", "=")
            if endpoint == "qualitative" and relation != "=":
                raise ValueError("Qualitative reports cannot imply numeric censoring bounds.")
            conditions = request.conditions
            if request.columns.batch:
                conditions = AssayConditions.model_validate(
                    {
                        **conditions.model_dump(),
                        "batch": cell("batch"),
                    }
                )
            group = group_digest(endpoint, normalized_unit, conditions)
            replicate = cell("replicate")
            if replicate:
                identity = (compound, group, replicate)
                if identity in seen_replicates:
                    raise ValueError("A compound, condition and replicate identity is duplicated.")
                seen_replicates.add(identity)
            uncertainty = None
            if cell("uncertainty"):
                if numeric is None or relation != "=":
                    raise ValueError("Numeric SD/SEM requires an exact numeric observation.")
                uncertainty = ReportedUncertainty(
                    kind=request.uncertainty_kind,
                    value=number(cell("uncertainty")),
                    unit=unit,
                )
            issues = []
            if not replicate:
                issues.append("replicate_identity_not_reported")
            if endpoint in {"KD", "Ki", "IC50", "EC50", "DC50"} and numeric == 0:
                issues.append("zero_concentration_requires_review")
            if (
                endpoint in {"Dmax", "inhibition"}
                and numeric is not None
                and not 0 <= numeric <= 100
            ):
                issues.append("percent_outside_nominal_range_retained")
            observations.append(
                EvidenceObservation(
                    id=f"source_row_{index + 1}",
                    source_row=reader.line_num,
                    compound=compound,
                    molecule=request.compound_links.get(compound),
                    endpoint=endpoint,
                    reported_value=cell("value"),
                    reported_unit=unit,
                    relation=relation,
                    replicate=replicate,
                    conditions=conditions,
                    value=numeric,
                    normalized_value=normalized,
                    normalized_unit=normalized_unit,
                    uncertainty=uncertainty,
                    issues=tuple(issues),
                    comparison_group=group,
                )
            )
            compounds.add(compound)
    except csv.Error as exc:
        raise ValueError("The CSV quoting or cell size is invalid.") from exc
    if not observations or set(request.compound_links) - compounds:
        raise ValueError(
            "Provide observations and link only compound identities present in the table."
        )
    return tuple(observations)


def csv_reader(content, delimiter):
    if not 0 < len(content) <= MAX_BYTES or b"\x00" in content:
        raise ValueError("Use a nonempty UTF-8 experimental table no larger than 16 MiB.")
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
        names = reader.fieldnames or []
    except (UnicodeError, csv.Error) as exc:
        raise ValueError("Experimental tables require valid UTF-8 CSV text.") from exc
    if not names or len(names) > 32 or len(names) != len(set(names)):
        raise ValueError("Experimental column names must be distinct; at most 32 are supported.")
    return reader
