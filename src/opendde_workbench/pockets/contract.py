"""Protein-site prediction is distinct from docking or ligand affinity."""

from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata


class PocketSearch(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["pocket_search"] = "pocket_search"
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f]+$")
    project_id: UUID | None = None
    protein: MoleculeRef
    profile: Literal["experimental", "predicted"] = "predicted"
    threads: int = Field(default=4, ge=1, le=32)
    memory_mib: int = Field(default=2048, ge=512, le=8192)
    point_threshold: float = Field(default=0.4, ge=0, le=1, allow_inf_nan=False)
    minimum_cluster: int = Field(default=3, ge=1, le=100)
    review_limit: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def first_model(self) -> Self:
        if self.protein.record or self.protein.conformer:
            raise ValueError(
                "The current protein-site adapter requires the first structural model."
            )
        return self
