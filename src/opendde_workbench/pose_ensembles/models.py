"""Persisted exploration and completed native hypotheses, without another job state machine."""

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from ..docking.result import Pose
from ..scientific_objects import MoleculeRef, ScientificModel
from .contracts import ExplorationInput, PoseCombination


class ExplorationPlan(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    request: ExplorationInput
    site_set_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    plan_id: UUID
    plan_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    combinations: tuple[PoseCombination, ...] = Field(min_length=1, max_length=30)
    created_at: str


class PoseMember(ScientificModel):
    evidence: Pose
    reference: MoleculeRef | None

    @model_validator(mode="after")
    def qualified_only(self):
        if self.evidence.valid != (self.reference is not None):
            raise ValueError("Only qualified native poses can have reusable scientific versions.")
        if self.reference and (self.reference.record or self.reference.conformer):
            raise ValueError("Individual pose artifacts must retain explicit record/conformer 0.")
        return self


class PoseOutcome(ScientificModel):
    combination: PoseCombination
    job_id: UUID | None
    status: Literal["succeeded", "failed", "cancelled", "interrupted", "missing", "not_attempted"]
    reason: str | None = Field(default=None, max_length=1000)
    report_reference: MoleculeRef | None = None
    software_version: str | None = None
    binary_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    parser: str | None = None
    initial_conformer_generated: bool | None = None
    scientific_outcome: Literal["candidates", "no_valid_pose"] | None = None
    poses: tuple[PoseMember, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def attempted_evidence(self):
        if self.status == "succeeded":
            if any(
                v is None
                for v in (
                    self.job_id,
                    self.report_reference,
                    self.software_version,
                    self.binary_sha256,
                    self.parser,
                    self.initial_conformer_generated,
                    self.scientific_outcome,
                )
            ):
                raise ValueError("Successful combinations require exact indexed native evidence.")
        elif self.poses or self.report_reference is not None or not self.reason:
            raise ValueError("Unavailable combinations retain a reason, never invented poses.")
        return self


class PoseEnsemble(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    exploration_id: UUID
    run_id: UUID
    workflow_state: Literal["succeeded", "failed", "cancelled"]
    outcomes: tuple[PoseOutcome, ...] = Field(min_length=1, max_length=30)
    qualified_pose_count: int = Field(ge=0, le=3000)
    collection_status: Literal["complete", "partial"]
    scientific_scope: Literal["native_pose_hypotheses_not_experimental_binding_proof"] = (
        "native_pose_hypotheses_not_experimental_binding_proof"
    )
    created_at: str

    @model_validator(mode="after")
    def counts(self):
        if self.qualified_pose_count != sum(
            p.evidence.valid for o in self.outcomes for p in o.poses
        ):
            raise ValueError("Pose collection count differs from qualified native hypotheses.")
        complete = self.workflow_state == "succeeded" and all(
            o.status == "succeeded" for o in self.outcomes
        )
        if (self.collection_status == "complete") != complete:
            raise ValueError("Collection completeness differs from actual attempted combinations.")
        return self
