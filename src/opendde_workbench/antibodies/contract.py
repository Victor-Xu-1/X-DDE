"""Exact FASTA sequence version enters one bounded native annotation task."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import NumberingOptions


class AntibodyNumberTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["antibody_number"] = "antibody_number"
    name: str = Field(
        default="Antibody annotation", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    project_id: UUID | None = None
    sequences: MoleculeRef
    options: NumberingOptions = Field(default_factory=NumberingOptions)

    @model_validator(mode="after")
    def source(self):
        if self.constraints or self.sequences.record or self.sequences.conformer:
            raise ValueError(
                "Numbering uses FASTA sequences, without molecular coordinates or constraints."
            )
        if self.scientific_inputs != [self.sequences]:
            raise ValueError("Antibody annotation requires the exact input sequence version.")
        return self
