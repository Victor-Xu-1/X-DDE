"""Whole datasets and completed native artifacts have explicit immutable references."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..integrations.options import ExecutionOptions
from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .del_options import DELOptions
from .drugclip_options import DrugCLIPOptions
from .library_options import LibraryOptions

OPERATIONS = {
    "library_prepare": ("chemistry", "prepare"),
    "library_subset": ("chemistry", "subset"),
    "drugclip_index": ("drugclip", "index"),
    "drugclip_retrieve": ("drugclip", "retrieve"),
    **{
        "del_" + mode: ("deli", mode)
        for mode in (
            "validate",
            "enumerate",
            "decode",
            "count",
            "analyze",
            "series",
            "model",
            "candidates",
            "followup",
        )
    },
}


class DatasetMaterial(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["data", "structure", "ligand", "definition", "building_blocks", "counts", "reads"]
    source: MoleculeRef
    label: str = Field(default="", max_length=120)


class NativeSource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    job_id: UUID
    report_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    role: Literal[
        "library", "index", "definition", "decoded", "counts", "analysis", "screening", "model"
    ]


Payload = Annotated[LibraryOptions | DrugCLIPOptions | DELOptions, Field(discriminator="kind")]


class DatasetTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal[
        "library_prepare",
        "library_subset",
        "drugclip_index",
        "drugclip_retrieve",
        "del_validate",
        "del_enumerate",
        "del_decode",
        "del_count",
        "del_analyze",
        "del_series",
        "del_model",
        "del_candidates",
        "del_followup",
    ]
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$")
    project_id: UUID | None = None
    inputs: list[DatasetMaterial] = Field(default_factory=list, max_length=128)
    sources: list[NativeSource] = Field(default_factory=list, max_length=35)
    payload: Payload
    options: ExecutionOptions = Field(default_factory=ExecutionOptions)
    output_bytes: int = Field(default=50 * 1024**3, ge=1024**3, le=200 * 1024**3, strict=True)
    time_limit_seconds: int = Field(default=86400, ge=60, le=604800, strict=True)

    @model_validator(mode="after")
    def scientific_contract(self):
        if (self.payload.kind, self.payload.mode) != OPERATIONS[self.operation]:
            raise ValueError("Choose the matching dataset operation and native method.")
        if self.constraints:
            raise ValueError("These data operations do not execute chemical constraint sets.")
        if self.scientific_inputs != [item.source for item in self.inputs]:
            raise ValueError("Confirm the exact data and structural input versions.")
        if len({str(item.job_id) for item in self.sources}) != len(self.sources):
            raise ValueError("Choose each source result once.")
        if any(
            item.source.conformer or item.source.record and item.role != "ligand"
            for item in self.inputs
        ):
            raise ValueError("Whole datasets and structures use original record/conformer zero.")
        roles = [item.role for item in self.inputs]
        if self.payload.kind == "deli":
            from .del_contract import validate_task

            validate_task(self)
        elif self.operation == "library_prepare":
            if roles != ["data"] or self.sources:
                raise ValueError("Library preparation needs one new library file.")
        elif self.operation == "library_subset":
            if self.inputs or len(self.sources) != 1 or self.sources[0].role != "library":
                raise ValueError("Subset extraction needs one prepared library version.")
            if not self.payload.selected_ids or len(set(self.payload.selected_ids)) != len(
                self.payload.selected_ids
            ):
                raise ValueError("Select explicit unique chemical member identities.")
        elif self.operation == "drugclip_index":
            if self.inputs or len(self.sources) != 1 or self.sources[0].role != "library":
                raise ValueError("Index exactly one completed prepared library.")
        else:
            if not self.sources or any(item.role != "index" for item in self.sources):
                raise ValueError("Choose completed indexes with the same DrugCLIP model version.")
            expected = [self.payload.receptor]
            if self.payload.search.kind == "reference_ligand":
                expected.append(self.payload.search.reference)
            if [item.source for item in self.inputs] != expected:
                raise ValueError("Confirm the exact receptor and optional pocket-defining ligand.")
            if roles != (["structure", "ligand"] if len(expected) == 2 else ["structure"]):
                raise ValueError(
                    "Confirm the receptor and pocket-defining ligand in their exact roles."
                )
        if self.payload.kind == "chemistry" and self.options.device != "cpu":
            raise ValueError("This chemical data preparation runs on CPU.")
        if (
            self.payload.kind == "drugclip"
            and self.payload.precision == "float16"
            and self.options.device != "cuda"
        ):
            raise ValueError("Half precision requires the selected server GPU.")
        return self
