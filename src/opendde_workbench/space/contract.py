"""Observed-structure native paths within the existing immutable task envelope."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..receptors.surface_options import SurfaceRegion
from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import ChannelOptions


class ChannelTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["channel_analysis"] = "channel_analysis"
    name: str = Field(
        default="Pocket channels and bottlenecks",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    structure: MoleculeRef
    starting_regions: tuple[SurfaceRegion, ...] = Field(min_length=1, max_length=12)
    options: ChannelOptions = Field(default_factory=ChannelOptions)

    @model_validator(mode="after")
    def exact_source(self):
        if (
            not self.name.strip()
            or self.constraints
            or self.structure.record
            or self.structure.conformer
        ):
            raise ValueError(
                "Channels observe an explicit structural model; they do not optimize poses."
            )
        if self.scientific_inputs != [self.structure]:
            raise ValueError(
                "The channel analysis must retain the exact selected structural version."
            )
        if len(set(self.starting_regions)) != len(self.starting_regions):
            raise ValueError("Choose each actual starting component once.")
        if self.options.context_chains and not {r.chain for r in self.starting_regions} <= set(
            self.options.context_chains
        ):
            raise ValueError("The starting region must belong to the actual obstacle context.")
        return self
