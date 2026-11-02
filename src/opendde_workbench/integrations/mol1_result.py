"""Keep native seeds, ranks and confidence files attached to the selected Mol-1 sample."""

import json
from typing import Literal

from pydantic import Field

from ..artifacts import contained
from ..scientific_objects import ScientificModel


class Mol1Sample(ScientificModel):
    candidate_id: str = Field(pattern=r"^seed-\d+-rank-\d+$")
    seed: int = Field(ge=0, le=2147483647)
    rank: int = Field(ge=0, le=7)
    summary_artifact: str = Field(pattern=r"^seed-\d+-rank-\d+-confidence\.json$")
    full_data_artifact: str | None = Field(
        default=None, pattern=r"^seed-\d+-rank-\d+-full-data\.json$"
    )
    preview_artifact: str | None = Field(
        default=None, pattern=r"^seed-\d+-rank-\d+-confidence-preview\.json$"
    )


class Mol1Evidence(ScientificModel):
    model: Literal["mol-1-base"]
    samples: list[Mol1Sample] = Field(min_length=1, max_length=64)
    confidence_axes: Literal["token_indices_not_residue_numbers"]
    scope: Literal["model_confidence_not_experimental_binding"]


def validate_mol1_result(result, request, output):
    if request.operation != "mol1_predict":
        if result.mol1 is not None:
            raise ValueError("Mol-1 confidence belongs only to its native prediction task.")
        return
    if result.mol1 is None:
        raise ValueError("Mol-1 prediction did not retain native sample/confidence evidence.")
    expected = [
        (seed, rank)
        for seed in [request.options.seed, *request.payload.additional_seeds]
        for rank in range(request.payload.samples)
    ]
    if [(row.seed, row.rank) for row in result.mol1.samples] != expected:
        raise ValueError("The native Mol-1 seed/sample set differs from the task request.")
    candidates = {candidate.id: candidate for candidate in result.candidates}
    if len(candidates) != len(expected):
        raise ValueError("Mol-1 returned an incomplete or unexpected candidate set.")
    for row in result.mol1.samples:
        key = f"seed-{row.seed}-rank-{row.rank}"
        candidate = candidates.get(key)
        if row.candidate_id != key or candidate is None or candidate.artifact != key + ".cif":
            raise ValueError("Mol-1 confidence does not match the selected native structure.")
        if (
            row.summary_artifact != key + "-confidence.json"
            or row.summary_artifact not in result.artifact_sha256
        ):
            raise ValueError("The Mol-1 native confidence file lacks its exact artifact identity.")
        if request.payload.atom_confidence != bool(row.full_data_artifact):
            raise ValueError("Mol-1 full confidence output differs from the requested setting.")
        if row.full_data_artifact and (
            row.full_data_artifact != key + "-full-data.json"
            or row.full_data_artifact not in result.artifact_sha256
        ):
            raise ValueError("Mol-1 full confidence was replaced or belongs to another sample.")
        if row.full_data_artifact:
            if (
                row.preview_artifact != key + "-confidence-preview.json"
                or row.preview_artifact not in result.artifact_sha256
            ):
                raise ValueError(
                    "Mol-1 confidence preview is missing or belongs to a different sample."
                )
            preview = json.loads(contained(output, row.preview_artifact).read_text())
            if preview.get("source_sha256") != result.artifact_sha256[row.full_data_artifact]:
                raise ValueError(
                    "Mol-1 preview does not retain its original native confidence identity."
                )
        elif row.preview_artifact is not None:
            raise ValueError("Mol-1 confidence preview requires its complete native source data.")
        report = json.loads(contained(output, row.summary_artifact).read_text())
        for native, label, scale in (
            ("plddt", "pLDDT", "0–100"),
            ("ptm", "pTM", "0–1"),
            ("iptm", "ipTM", "0–1"),
        ):
            metrics = [metric for metric in candidate.metrics if metric.name == label]
            if (
                len(metrics) != 1
                or metrics[0].unit != scale
                or metrics[0].value != report.get(native)
            ):
                raise ValueError("Mol-1 native confidence scales or values were changed.")
