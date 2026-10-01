"""Exact versioned FASTA input enters the existing platform task authority."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import HumanizationOptions


class HumanizationTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["antibody_humanize"] = "antibody_humanize"
    name: str = Field(
        default="Antibody sequence evaluation",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    sequences: MoleculeRef
    options: HumanizationOptions = Field(default_factory=HumanizationOptions)

    @field_validator("name")
    @classmethod
    def visible_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Give the task a visible name.")
        return value

    @model_validator(mode="after")
    def exact_source(self):
        if self.constraints or self.sequences.record or self.sequences.conformer:
            raise ValueError("Use an exact FASTA version, without coordinate constraints.")
        if self.scientific_inputs != [self.sequences]:
            raise ValueError("Sequence evaluation requires the exact selected source version.")
        return self
