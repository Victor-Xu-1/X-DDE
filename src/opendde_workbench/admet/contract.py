"""Exact individual molecular versions and whole-file input are distinct contracts."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from ..chemistry.screen_contract import LibraryRef
from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import AdmetOptions


class AdmetTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["admet_predict"] = "admet_predict"
    name: str = Field(
        default="Early ADMET predictions",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    molecule: MoleculeRef | None = None
    library: LibraryRef | None = None
    options: AdmetOptions = Field(default_factory=AdmetOptions)

    @field_validator("name")
    @classmethod
    def visible_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Task name must contain visible text.")
        return value

    @model_validator(mode="after")
    def inputs(self):
        if (self.molecule is None) == (self.library is None):
            raise ValueError("Choose one exact molecular record or one whole SDF file.")
        if self.constraints or (self.molecule and self.molecule.conformer):
            raise ValueError("ADMET predictions use chemical graphs, not coordinate constraints.")
        if self.scientific_inputs != ([self.molecule] if self.molecule else []):
            raise ValueError("Molecular predictions require the exact selected input version.")
        return self

    @property
    def source(self):
        return self.molecule if self.molecule is not None else self.library
