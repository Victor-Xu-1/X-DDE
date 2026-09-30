"""Consumed cross-engine scientific inputs; task execution remains in one envelope."""

from pydantic import BaseModel, Field

from .research.constraint_contract import ConstraintReference
from .scientific_objects import MoleculeRef


class TaskMetadata(BaseModel):
    constraints: ConstraintReference | None = None
    scientific_inputs: list[MoleculeRef] = Field(default_factory=list, max_length=64)
