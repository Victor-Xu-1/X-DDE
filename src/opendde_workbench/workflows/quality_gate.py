"""A completed calculation is not permission to dispatch past a failed quality condition."""

import json

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..artifacts import contained
from ..quality.assessment import assess_checks
from ..quality.manifest import CHECKS
from ..quality.result import validate_quality

REJECTED = (
    "Required pose-quality checks did not pass. "
    "Open the quality step for measured results and missing checks."
)


class PoseQualityGate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    required_checks: tuple[str, ...] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique(self):
        if len(set(self.required_checks)) != len(self.required_checks):
            raise ValueError("Quality gate checks must be explicit and unique.")
        return self


class QualityGateRejected(ValueError):
    pass


def validate_gate_request(step):
    gate = step.quality_gate
    if gate is None:
        return
    if step.request.operation != "pose_quality" or not set(gate.required_checks) <= set(
        CHECKS[step.request.options.profile]
    ):
        raise ValueError("Quality gates require checks from their exact pose-quality profile.")


def require_quality(plan, latest, store, settings, *, dependencies=None):
    for step in plan.steps:
        if step.quality_gate is None or dependencies is not None and step.id not in dependencies:
            continue
        attempt = latest.get(step.id)
        job = store.get(attempt["job_id"]) if attempt else None
        if job is None or job.status != "succeeded" or job.request.operation != "pose_quality":
            raise ValueError("The required native quality task has not completed.")
        output = settings.state_dir / "jobs" / job.id / "output"
        report = contained(output, "result.json")
        if report.stat().st_size > 4 * 1024**2:
            raise ValueError("Quality report exceeds its handoff budget.")
        result = validate_quality(json.loads(report.read_bytes()), job.request, output)
        checks = assess_checks(result)
        statuses = {check["id"]: check["assessment"] for check in checks}
        if any(check["assessment"] == "fail" for check in checks) or any(
            statuses.get(check) != "pass" for check in step.quality_gate.required_checks
        ):
            raise QualityGateRejected(REJECTED)
