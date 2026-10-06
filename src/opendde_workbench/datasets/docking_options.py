"""Batched GNINA preserves a selected candidate set and one exact receptor/pocket frame."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator

from ..docking.contract import Search
from ..docking.options import DockingOptions
from ..scientific_objects import MoleculeRef


class BatchDockingOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["gnina"] = "gnina"
    mode: Literal["batch"] = "batch"
    receptor: MoleculeRef
    search: Search
    selected_ids: list[str] = Field(min_length=1, max_length=500)
    docking: DockingOptions = Field(default_factory=DockingOptions)
    retain_heterogens: list[str] = Field(default_factory=list, max_length=20)
    alternate_locations: Literal["reject", "highest_occupancy", "A", "B"] = "reject"

    @model_serializer(mode="wrap")
    def stable_wire(self, handler):
        value = handler(self)
        if self.alternate_locations == "reject":
            value.pop("alternate_locations", None)
        if not self.retain_heterogens:
            value.pop("retain_heterogens", None)
        return value

    @model_validator(mode="after")
    def exact_frame(self):
        if any(not value.isalnum() or len(value) > 3 for value in self.retain_heterogens):
            raise ValueError(
                "Choose explicit PDB cofactor/metal residue names of one to three letters."
            )
        if self.search.frame != self.receptor or self.receptor.record or self.receptor.conformer:
            raise ValueError(
                "Batch docking needs one exact receptor model and its confirmed pocket."
            )
        if len(set(self.selected_ids)) != len(self.selected_ids) or any(
            not value or len(value) > 240 for value in self.selected_ids
        ):
            raise ValueError(
                "Select explicit unique candidate identities, not table row positions."
            )
        return self
