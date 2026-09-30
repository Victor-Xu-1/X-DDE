"""Consumed cross-engine scientific inputs; task execution remains in one envelope."""

from pydantic import BaseModel, Field

from .scientific_objects import MoleculeRef


class TaskMetadata(BaseModel):
    scientific_inputs: list[MoleculeRef] = Field(default_factory=list, max_length=64)
