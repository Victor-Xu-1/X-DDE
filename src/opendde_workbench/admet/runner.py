"""Actual offline ADMET-AI ensembles; no reference percentiles or fabricated predictions."""

import hashlib
import json
import math
from pathlib import Path

from manifest import CLASSIFICATION, ENDPOINTS, METADATA, METADATA_DIGEST, VERSIONS
from models import predict, verify_models
from native_inputs import inputs
from options import AdmetOptions
from serialization import rows_csv


def run(request, bindings, directory):
    options = AdmetOptions.model_validate(request["options"])
    source, rows, smiles, blocks = inputs(request, bindings, directory)
    model_root = verify_models()
    predictions = predict(smiles, options.cpu, model_root) if smiles else {}
    for row in rows:
        if row["status"] != "pending":
            continue
        values = predictions[row["smiles"]]
        if not all(math.isfinite(value) for value in values.values()) or any(
            not 0 <= values[key] <= 1 for key in CLASSIFICATION
        ):
            row.update(status="failed", reason="native_prediction_unavailable")
        else:
            row.update(status="predicted", predictions=values)
    predicted_count = sum(row["status"] == "predicted" for row in rows)
    previews = {}
    for row in rows:
        row["preview"] = None
        if row["smiles"]:
            name = f"source-record-{row['record'] + 1}.sdf"
            content = blocks[row["record"]] + b"\n$$$$\n"
            Path("/output", name).write_bytes(content)
            previews[name] = hashlib.sha256(content).hexdigest()
            row["preview"] = name
    csv_content = rows_csv(rows, ENDPOINTS)
    return {
        "operation": "admet_predict",
        "schema_version": 1,
        "complete": True,
        "source": source,
        "source_kind": "molecule" if request.get("molecule") else "library",
        "options": options.model_dump(mode="json"),
        "versions": VERSIONS,
        "endpoint_metadata_sha256": METADATA_DIGEST,
        "model_weights": METADATA["weights"],
        "models_executed": bool(smiles),
        "rows": rows,
        "predicted_count": predicted_count,
        "classification": "complete"
        if predicted_count == len(rows)
        else "partial"
        if predicted_count
        else "empty",
        "csv_sha256": hashlib.sha256(csv_content).hexdigest(),
        "previews_sha256": previews,
        "scope": "native_model_predictions_not_measurements_or_clinical_decisions",
        "drugbank_reference": "disabled",
        "applicability_domain": "not_established",
        "uncertainty": "not_provided_by_native_api",
    }, csv_content


def main():
    directory = Path("/input")
    request = json.loads((directory / "request.json").read_text())
    if request["operation"] != "admet_predict":
        raise ValueError("Unsupported ADMET operation.")
    report, csv_content = run(
        request, json.loads((directory / "bindings.json").read_text()), directory
    )
    table = Path("/output/predictions.csv.tmp")
    table.write_bytes(csv_content)
    table.replace("/output/predictions.csv")
    file = Path("/output/result.json.tmp")
    file.write_text(json.dumps(report, allow_nan=False), encoding="utf-8")
    file.replace("/output/result.json")


if __name__ == "__main__":
    main()
