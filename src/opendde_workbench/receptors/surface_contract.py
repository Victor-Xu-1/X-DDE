"""Typed exposure task in the existing queue; target stays in its source frame."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .surface_options import SurfaceOptions, SurfaceRegion


class SurfaceExposureTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["surface_exposure"] = "surface_exposure"
    name: str = Field(
        default="Region exposure", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    project_id: UUID | None = None
    structure: MoleculeRef
    regions: tuple[SurfaceRegion, ...] = Field(min_length=1, max_length=128)
    options: SurfaceOptions = Field(default_factory=SurfaceOptions)

    @model_validator(mode="after")
    def exact_selection(self):
        if self.constraints or self.structure.record or self.structure.conformer:
            raise ValueError(
                "Exposure measures observed coordinates; choose the structural model explicitly."
            )
        if self.scientific_inputs != [self.structure]:
            raise ValueError("Exposure requires the exact selected structural input version.")
        if len(set(self.regions)) != len(self.regions):
            raise ValueError("Selected region identities must be unique.")
        if self.options.context_chains and not {r.chain for r in self.regions} <= set(
            self.options.context_chains
        ):
            raise ValueError("The measurement region must belong to the selected assembly context.")
        return self
