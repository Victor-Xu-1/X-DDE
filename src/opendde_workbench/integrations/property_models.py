"""Read reusable checkpoints and their evidence through the successful-job authority."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from ..artifacts import contained
from .contract import IntegratedTask
from .result import NativeMetric, validate_result

if TYPE_CHECKING:
    from ..models import Job


class PropertyModelUnavailable(ValueError):
    """The requested job is not a completed property-training task."""


class PropertyModelSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: str
    name: str
    activity_property: str
    activity_unit: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_report_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    validation_metrics: list[NativeMetric] = Field(max_length=40)
    validation_records: int = Field(ge=0, le=500)


class PropertyModelCatalogue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    models: list[PropertyModelSummary] = Field(max_length=100)


@dataclass(frozen=True)
class VerifiedPropertyModel:
    path: Path
    summary: PropertyModelSummary


def verified_property_model(state: Path, job: Job | None) -> VerifiedPropertyModel:
    if (
        job is None
        or job.status != "succeeded"
        or not isinstance(job.request, IntegratedTask)
        or job.request.operation != "chemprop_train"
    ):
        raise PropertyModelUnavailable("Choose a successfully trained X-DDE property model.")
    output = state / "jobs" / job.id / "output"
    report = contained(output, "result.json")
    if report.stat().st_size > 4 * 1024**2:
        raise ValueError("Property model report exceeds its bounded size.")
    original = report.read_bytes()
    result = validate_result(json.loads(original), job.request, output)
    if not result.model_artifact:
        raise ValueError("The training result has no reusable checkpoint.")
    # validate_result seals the checkpoint and every referenced scientific file.
    # An executable model and its reported validation are never separate registries.
    return VerifiedPropertyModel(
        path=contained(output, result.model_artifact),
        summary=PropertyModelSummary(
            job_id=job.id,
            name=job.request.name,
            activity_property=job.request.payload.activity_property,
            activity_unit=job.request.payload.activity_unit,
            sha256=result.artifact_sha256[result.model_artifact],
            source_report_sha256=hashlib.sha256(original).hexdigest(),
            validation_metrics=[
                metric for metric in result.metrics if metric.meaning == "validation"
            ],
            validation_records=len(result.validation_points),
        ),
    )
