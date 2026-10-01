"""Structure preparation consumes one exact version in the unified task envelope."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .preparation_options import PreparationOptions


class StructurePrepareTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["structure_prepare"] = "structure_prepare"
    name: str = Field(
        default="Prepare structure", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    project_id: UUID | None = None
    structure: MoleculeRef
    options: PreparationOptions = Field(default_factory=PreparationOptions)

    @model_validator(mode="after")
    def source(self):
        if self.constraints or self.structure.record or self.structure.conformer:
            raise ValueError(
                "Prepare one model; review constraints on the resulting structural version."
            )
        if self.scientific_inputs != [self.structure]:
            raise ValueError("Preparation requires the exact selected structural input version.")
        return self
