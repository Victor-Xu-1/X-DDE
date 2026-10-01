"""Receptor ensembles enter the existing immutable task/version envelope."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef, ScientificModel
from ..task_metadata import TaskMetadata
from .selection import EnsembleOptions, MemberSelection


class ReceptorInput(ScientificModel):
    structure: MoleculeRef
    selection: MemberSelection = Field(default_factory=MemberSelection)


class ReceptorEnsembleTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["receptor_ensemble"] = "receptor_ensemble"
    name: str = Field(
        default="Receptor conformation ensemble",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    inputs: tuple[ReceptorInput, ...] = Field(min_length=2, max_length=16)
    options: EnsembleOptions = Field(default_factory=EnsembleOptions)

    @model_validator(mode="after")
    def selections(self):
        if self.options.reference_index >= len(self.inputs):
            raise ValueError("The reference structure must belong to this input collection.")
        selected = self.inputs[self.options.reference_index].selection
        if selected.chain_pairs or selected.residue_pairs:
            raise ValueError("The reference member does not require an alignment mapping.")
        if self.constraints:
            raise ValueError(
                "Receptor alignment changes coordinates; "
                "review constraints on the aligned versions."
            )
        keys = []
        for item in self.inputs:
            if item.structure.record or item.structure.conformer:
                raise ValueError(
                    "Select structural models through model_index, "
                    "not molecular records/conformers."
                )
            keys.append(
                (
                    item.structure.sha256,
                    item.selection.model_index,
                    tuple(sorted(item.selection.chains)),
                )
            )
        if len(set(keys)) != len(keys):
            raise ValueError(
                "Each member must select a distinct structure/model/chain combination."
            )
        return self
