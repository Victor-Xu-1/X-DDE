"""Download reported and normalized values without losing censoring or conditions."""

import csv
import io

from .evidence_values import summaries


def safe_text(value):
    text = "" if value is None else str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def export_csv(document):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(
        [
            "source_row",
            "compound",
            "endpoint",
            "reported_relation",
            "reported_value",
            "reported_unit",
            "normalized_value",
            "normalized_unit",
            "replicate",
            "batch",
            "target",
            "assay",
            "species",
            "construct",
            "temperature_c",
            "ph",
            "buffer",
            "reported_uncertainty_kind",
            "reported_uncertainty",
            "reported_uncertainty_unit",
            "source",
            "comparison_group",
            "issues",
        ]
    )
    for row in document.observations:
        conditions = row.conditions
        writer.writerow(
            [
                row.source_row,
                safe_text(row.compound),
                row.endpoint,
                row.relation,
                safe_text(row.reported_value) if row.value is None else row.reported_value,
                row.reported_unit,
                row.normalized_value,
                row.normalized_unit,
                safe_text(row.replicate),
                safe_text(conditions.batch),
                safe_text(conditions.target),
                safe_text(conditions.assay),
                safe_text(conditions.species),
                safe_text(conditions.construct),
                conditions.temperature_c,
                conditions.ph,
                safe_text(conditions.buffer),
                row.uncertainty.kind if row.uncertainty else "",
                row.uncertainty.value if row.uncertainty else "",
                row.uncertainty.unit if row.uncertainty else "",
                safe_text(document.request.citation),
                row.comparison_group,
                ";".join(row.issues),
            ]
        )
    return stream.getvalue().encode("utf-8-sig")


def public_document(document):
    return {**document.model_dump(mode="json"), "summaries": summaries(document)}
