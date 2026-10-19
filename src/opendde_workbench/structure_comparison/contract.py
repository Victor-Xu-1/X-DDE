"""Two exact structural versions; execution, recovery and assets remain platform-owned."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import ComparisonOptions


class StructureComparisonTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["structure_compare"] = "structure_compare"
    name: str = Field(
        default="Compare reference-conditioned protein interfaces",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    reference: MoleculeRef
    moving: MoleculeRef
    options: ComparisonOptions

    @model_validator(mode="after")
    def exact_sources(self):
        if self.constraints:
            raise ValueError(
                "Comparison transforms coordinates; review constraints on its derived versions."
            )
        if any(source.record or source.conformer for source in (self.reference, self.moving)):
            raise ValueError("Choose structural models through explicit comparison model indices.")
        if self.scientific_inputs != [self.reference, self.moving]:
            raise ValueError("Comparison requires both exact structural input versions in order.")
        return self
