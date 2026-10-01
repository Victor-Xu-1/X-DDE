"""One exact molecular record; receptor/reference coordinate context is explicit."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import QualityOptions


class PoseQualityTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["pose_quality"] = "pose_quality"
    name: str = Field(
        default="Molecular pose quality",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    molecule: MoleculeRef
    protein: MoleculeRef | None = None
    reference: MoleculeRef | None = None
    coordinate_basis: Literal["user_confirmed"] | None = None
    options: QualityOptions = Field(default_factory=QualityOptions)

    @model_validator(mode="after")
    def context(self):
        profile = self.options.profile
        if self.constraints or any(ref.conformer for _, ref in references(self)):
            raise ValueError("Quality checks require conformer0 and no molecular constraints.")
        if self.protein and self.protein.record:
            raise ValueError("Select one prepared receptor model.")
        if profile == "mol":
            if self.protein or self.reference or self.coordinate_basis:
                raise ValueError(
                    "Free-conformation checks do not claim a protein coordinate frame."
                )
        elif not self.protein or self.coordinate_basis != "user_confirmed":
            raise ValueError(
                "Confirm that the selected pose is in this exact receptor coordinate frame."
            )
        if (profile == "redock") != (self.reference is not None):
            raise ValueError("Only reference-comparison mode requires a cognate experimental pose.")
        if self.scientific_inputs != [ref for _, ref in references(self)]:
            raise ValueError("Quality checks require the exact selected input versions.")
        return self


def references(task):
    return [
        (name, ref)
        for name in ("molecule", "protein", "reference")
        if (ref := getattr(task, name)) is not None
    ]
