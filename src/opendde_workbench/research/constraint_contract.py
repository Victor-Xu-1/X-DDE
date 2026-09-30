"""Immutable research conditions; execution support is computed, never user supplied."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from ..docking.options import SearchBox
from ..scientific_objects import MoleculeRef, ScientificModel

Text = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f]+$")]


class ConstraintReference(ScientificModel):
    id: UUID
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class CoordinateFrame(ScientificModel):
    reference: MoleculeRef
    basis: Literal["reference_coordinates", "user_confirmed_alignment"]
    unit: Literal["angstrom"] = "angstrom"


class Condition(ScientificModel):
    id: UUID
    label: Text
    strength: Literal["hard", "soft"] = "hard"
    weight: float | None = Field(default=None, gt=0, le=1000, allow_inf_nan=False)
    scope: Literal["subject", "target_a", "target_b", "assembly"] = "subject"
    source: Text = "user_selection"

    @model_validator(mode="after")
    def semantic(self) -> Self:
        if not self.label.strip() or not self.source.strip():
            raise ValueError("Condition label and source must contain visible text.")
        if (self.strength == "soft") != (self.weight is not None):
            raise ValueError("Soft conditions require a weight; hard conditions cannot have one.")
        return self


class FixedRegionCondition(Condition):
    kind: Literal["fixed_region"]
    phase: Literal["sampling"] = "sampling"
    region_id: UUID
    region_name: Text
    validator: Literal["exact_native_indices"] = "exact_native_indices"


class SearchBoxCondition(Condition):
    kind: Literal["search_box"]
    phase: Literal["input"] = "input"
    scope: Literal["target_a", "target_b", "assembly"] = "target_a"
    box: SearchBox
    validator: Literal["exact_native_search_box"] = "exact_native_search_box"


ConstraintCondition = Annotated[
    FixedRegionCondition | SearchBoxCondition, Field(discriminator="kind")
]


class ConstraintSet(ScientificModel):
    schema_version: Literal[1] = 1
    name: Text
    subject: MoleculeRef
    frame: CoordinateFrame | None = None
    parent_id: UUID | None = None
    conditions: tuple[ConstraintCondition, ...] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def consistent(self) -> Self:
        if not self.name.strip():
            raise ValueError("Constraint set name must contain visible text.")
        if len({c.id for c in self.conditions}) != len(self.conditions):
            raise ValueError("Condition identities must be unique.")
        if len({c.label.strip() for c in self.conditions}) != len(self.conditions):
            raise ValueError("Condition labels must be unique.")
        boxes = [c for c in self.conditions if c.kind == "search_box"]
        if boxes and not self.frame:
            raise ValueError("Spatial conditions require an explicit versioned coordinate frame.")
        for scope in {c.scope for c in boxes}:
            values = [c.box for c in boxes if c.scope == scope]
            if len({v.model_dump_json() for v in values}) > 1:
                raise ValueError("Conflicting search boxes for the same scope cannot be combined.")
        return self


class ConditionSupport(ScientificModel):
    condition_id: UUID
    support: Literal["native", "adapter", "result_check", "unsupported"]
    phase: Literal["input", "sampling", "result"]
    validator: str
    supported: bool
    reason: str
    reason_code: Literal[
        "native_fixed",
        "native_box",
        "wrong_subject",
        "wrong_frame",
        "wrong_scope",
        "soft_unsupported",
        "wrong_engine",
        "different_parameters",
        "missing_selection",
    ]
    native_parameter: str | None = None
    value: list[int] | SearchBox | None = None
    independent_result_check: Literal["not_implemented"] = "not_implemented"


class ConstraintExecution(ScientificModel):
    schema_version: Literal[1] = 1
    reference: ConstraintReference
    operation: str
    mode: str
    executable: bool
    conditions: tuple[ConditionSupport, ...]
    document: ConstraintSet
