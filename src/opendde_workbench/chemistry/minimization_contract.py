"""Optimize an exact existing 3D record; never embed or enumerate a different state."""

from typing import Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .minimization_options import MinimizationOptions


class MoleculeMinimizeTask(TaskMetadata):
    operation: Literal["molecule_minimize"] = "molecule_minimize"
    name: str = Field(
        default="Molecule energy minimization",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    molecule: MoleculeRef
    options: MinimizationOptions = Field(default_factory=MinimizationOptions)

    @model_validator(mode="after")
    def existing_pose(self) -> Self:
        if self.molecule.conformer:
            raise ValueError("Choose one existing SDF/MOL pose, conformer 0.")
        if self.constraints:
            raise ValueError("Unbound minimization does not implement constrained optimization.")
        return self
