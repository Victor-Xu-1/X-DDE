"""Search and pose coordinates are explicitly relative to one immutable receptor."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef, ScientificModel
from ..task_metadata import TaskMetadata
from .options import DockingOptions, SearchBox


class ExplicitSearch(ScientificModel):
    kind: Literal["box"]
    frame: MoleculeRef
    box: SearchBox


class ReferenceSearch(ScientificModel):
    kind: Literal["reference_ligand"]
    frame: MoleculeRef
    reference: MoleculeRef
    coordinate_basis: Literal["user_confirmed"]


Search = Annotated[ExplicitSearch | ReferenceSearch, Field(discriminator="kind")]


class DockingTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["docking"] = "docking"
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f]+$")
    project_id: UUID | None = None
    mode: Literal["dock", "score", "minimize"] = "dock"
    receptor: MoleculeRef
    ligand: MoleculeRef
    search: Search | None = None
    pose_frame: MoleculeRef | None = None
    pose_coordinate_basis: Literal["user_confirmed"] | None = None
    options: DockingOptions = Field(default_factory=DockingOptions)

    @model_validator(mode="after")
    def frames(self) -> Self:
        if not self.name.strip():
            raise ValueError("Task name cannot be blank.")
        if self.mode == "score" and self.options.cnn_scoring not in {"none", "rescore"}:
            raise ValueError(
                "Score-only mode supports empirical or CNN rescoring, not search/refinement."
            )
        if self.receptor.record or self.receptor.conformer or self.ligand.conformer:
            raise ValueError("GNINA requires one receptor model and SDF conformer 0.")
        if self.mode == "dock":
            if not self.search or self.search.frame != self.receptor:
                raise ValueError("Docking needs a search region in the exact receptor frame.")
            if self.pose_frame is not None or self.pose_coordinate_basis is not None:
                raise ValueError("Pose confirmation is for scoring/minimization, not new docking.")
        elif (
            self.pose_frame != self.receptor
            or self.pose_coordinate_basis != "user_confirmed"
            or self.search is not None
        ):
            raise ValueError(
                "Confirm an existing ligand pose in this receptor frame before scoring."
            )
        if isinstance(self.search, ReferenceSearch) and self.search.reference.conformer:
            raise ValueError("Reference pocket ligands require SDF conformer 0.")
        return self


def references(request: DockingTask) -> list[tuple[str, MoleculeRef]]:
    values = [("receptor", request.receptor), ("ligand", request.ligand)]
    if isinstance(request.search, ReferenceSearch):
        values.append(("reference_ligand", request.search.reference))
    return values
