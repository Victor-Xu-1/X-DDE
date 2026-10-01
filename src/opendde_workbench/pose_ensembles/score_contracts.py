"""Immutable native-evidence comparisons, with explicit missing-score outcomes."""

import hashlib
import json
from typing import Literal
from uuid import UUID

from pydantic import Field, JsonValue, model_validator

from ..docking.result import Score
from ..scientific_objects import MoleculeRef, ScientificModel
from .ranking import MAX_COMPARISON_POSES, SCORE_NAMES


class PoseSelector(ScientificModel):
    step_id: str = Field(pattern=r"^pose_[0-9]{3}$")
    record: int = Field(strict=True, ge=0, lt=100)


class ScoreComparisonInput(ScientificModel):
    pose_set_id: UUID
    selections: tuple[PoseSelector, ...] = Field(min_length=1, max_length=MAX_COMPARISON_POSES)
    metrics: tuple[str, ...] = Field(default=("minimizedAffinity",), min_length=1, max_length=3)

    @model_validator(mode="after")
    def distinct_selection(self):
        if len(set(self.selections)) != len(self.selections):
            raise ValueError("Select each exact native pose only once.")
        if len(set(self.metrics)) != len(self.metrics) or any(
            name not in SCORE_NAMES for name in self.metrics
        ):
            raise ValueError("Choose distinct native score names, not a composite affinity.")
        return self


class ComparedPose(ScientificModel):
    selection: PoseSelector
    reference: MoleculeRef
    scores: tuple[Score, ...] = Field(min_length=1, max_length=3)
    front: int | None = Field(default=None, strict=True, ge=1, le=MAX_COMPARISON_POSES)
    missing_metrics: tuple[str, ...] = Field(default=(), max_length=3)

    @model_validator(mode="after")
    def explicit_unknown(self):
        if (self.front is None) != bool(self.missing_metrics):
            raise ValueError("Missing native metrics must remain explicitly unranked.")
        return self


class ScoreGroup(ScientificModel):
    condition_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    conditions: dict[str, JsonValue]
    poses: tuple[ComparedPose, ...] = Field(min_length=1, max_length=MAX_COMPARISON_POSES)

    @model_validator(mode="after")
    def conditions_match_digest(self):
        digest = hashlib.sha256(
            json.dumps(
                self.conditions, sort_keys=True, separators=(",", ":"), allow_nan=False
            ).encode()
        ).hexdigest()
        if digest != self.condition_sha256:
            raise ValueError("Native comparison conditions differ from their frozen digest.")
        return self


class ScoreComparison(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    request: ScoreComparisonInput
    exploration_id: UUID
    pose_set_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    groups: tuple[ScoreGroup, ...] = Field(min_length=1, max_length=MAX_COMPARISON_POSES)
    method: Literal["native_score_strict_pareto_within_frozen_conditions"] = (
        "native_score_strict_pareto_within_frozen_conditions"
    )
    normalization: Literal["none"] = "none"
    scientific_scope: Literal["score_tradeoffs_not_binding_proof_or_pose_clustering"] = (
        "score_tradeoffs_not_binding_proof_or_pose_clustering"
    )
    created_at: str

    @model_validator(mode="after")
    def preserve_selections(self):
        selected = [pose.selection for group in self.groups for pose in group.poses]
        if len(selected) != len(self.request.selections) or set(selected) != set(
            self.request.selections
        ):
            raise ValueError("Every selected pose must appear exactly once in its condition group.")
        return self
