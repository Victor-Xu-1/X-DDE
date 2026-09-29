"""Public API contracts and the validated OpenDDE input builder."""

import re
from enum import StrEnum
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Status(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLING = "cancelling"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


TERMINAL = {Status.SUCCEEDED, Status.FAILED, Status.CANCELLED, Status.INTERRUPTED}


class Component(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["protein", "ligand", "dna", "rna", "ion"]
    value: str = Field(min_length=1, max_length=5000)
    count: int = Field(default=1, ge=1, le=4)

    @model_validator(mode="after")
    def validate_value(self) -> Self:
        self.value = self.value.strip()
        if self.kind in {"protein", "dna", "rna"}:
            lines = self.value.splitlines()
            if (
                self.value.startswith(">")
                and sum(line.strip().startswith(">") for line in lines) == 1
            ):
                self.value = "".join(lines[1:])
            self.value = re.sub(r"\s+", "", self.value).upper()
            alphabets = {"protein": "ACDEFGHIKLMNPQRSTVWYX", "dna": "ATGCNX", "rna": "AUGCNX"}
            if not re.fullmatch(f"[{alphabets[self.kind]}]+", self.value):
                raise ValueError(
                    f"{self.kind.upper()} requires one sequence using {alphabets[self.kind]}."
                )
        elif self.kind == "ion":
            self.value = self.value.upper()
            if self.value not in {"MG", "ZN", "CA", "NA", "K", "CL", "MN", "FE", "CU", "CO"}:
                raise ValueError("Select a supported ion CCD code.")
        elif (
            not self.value
            or self.value.startswith("FILE_")
            or re.search(r"[\s\x00-\x1f]", self.value)
            or "://" in self.value
        ):
            raise ValueError(
                "Ligand must be SMILES or a CCD_ identifier; file/URL inputs are disabled."
            )
        return self


class Parameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seed: int = Field(default=101, ge=0, le=2**32 - 1)
    samples: int = Field(default=1, ge=1, le=8)
    steps: int = Field(default=200, ge=1, le=1000)
    cycles: int = Field(default=10, ge=1, le=20)
    dtype: Literal["bf16", "fp32"] = "bf16"
    model: Literal["standard", "abag"] = "standard"


class Prediction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    components: list[Component] = Field(min_length=1, max_length=8)
    parameters: Parameters = Field(default_factory=Parameters)
    project_id: UUID | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip() or any(ord(char) < 32 for char in value):
            raise ValueError("Task name must contain visible text.")
        return value.strip()

    def inference_input(self, job_id: str) -> list[dict]:
        entities = []
        for component in self.components:
            kind, key = {
                "protein": ("proteinChain", "sequence"),
                "dna": ("dnaSequence", "sequence"),
                "rna": ("rnaSequence", "sequence"),
                "ligand": ("ligand", "ligand"),
                "ion": ("ion", "ion"),
            }[component.kind]
            entities.append({kind: {key: component.value, "count": component.count}})
        return [{"name": job_id, "modelSeeds": [self.parameters.seed], "sequences": entities}]


class Artifact(BaseModel):
    name: str
    size: int


class Job(BaseModel):
    id: str
    request: Prediction
    status: Status
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    parent_id: str | None = None
