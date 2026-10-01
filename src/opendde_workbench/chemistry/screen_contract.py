"""A whole SDF file is distinct from an exact query molecular record/version."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef, ScientificModel
from ..task_metadata import TaskMetadata
from .screen_options import ScreenOptions


class LibraryRef(ScientificModel):
    asset_id: UUID
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class LibraryScreenTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["library_screen"] = "library_screen"
    name: str = Field(
        default="Early molecular library selection",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    library: LibraryRef
    query: MoleculeRef | None = None
    options: ScreenOptions = Field(default_factory=ScreenOptions)

    @model_validator(mode="after")
    def inputs(self):
        if self.constraints:
            raise ValueError(
                "Library selection does not perform constrained molecular calculations."
            )
        requires_query = self.options.mode in {"similarity", "substructure"}
        if requires_query != (self.query is not None):
            raise ValueError(
                "Select exactly one query molecule only for similarity/substructure search."
            )
        if self.query and self.query.conformer:
            raise ValueError("Library search uses chemical records, not conformer indices.")
        if self.scientific_inputs != ([self.query] if self.query else []):
            raise ValueError("Library query provenance requires its exact selected version.")
        return self
