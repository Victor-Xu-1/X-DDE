"""State preparation uses the existing immutable file/version task envelope."""

from typing import Literal
from uuid import UUID

from pydantic import Field

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import StateOptions


class MolecularStatesTask(TaskMetadata):
    operation: Literal["molecular_states"] = "molecular_states"
    name: str = Field(
        default="Molecular states and conformers",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    molecule: MoleculeRef
    options: StateOptions = Field(default_factory=StateOptions)
