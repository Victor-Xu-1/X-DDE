from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..research.contracts import ScientificObject


class ExampleModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SourceFile(ExampleModel):
    key: str
    name: str
    url: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    bytes: int = Field(ge=1, le=8 * 1024**2)
    kind: Literal["structure", "ligand"]
    license: Literal["CC0-1.0", "CC-BY-SA-3.0"]


class CaseStudy(ExampleModel):
    id: str
    revision: int = Field(ge=1)
    label: tuple[str, str]
    description: tuple[str, str]
    files: tuple[str, ...]
    sources: tuple[str, ...]
    evidence_entities: dict[str, dict[str, str]] = Field(default_factory=dict)


class ModuleExample(ExampleModel):
    case_id: str
    capability_id: str
    revision: int = Field(ge=1)
    pinned_run_required: bool


class PreparedExample(ExampleModel):
    module: ModuleExample
    case: CaseStudy
    objects: dict[str, ScientificObject]
    sequences: dict[str, str]
    sequence_sources: dict[str, tuple[str, ...]] = Field(default_factory=dict)
    sources: tuple[str, ...]
    request: dict | None = None
    workflow_plan: dict | None = None


class PinRequest(ExampleModel):
    job_id: UUID


class ExamplePin(ExampleModel):
    capability_id: str
    case_id: str
    revision: int
    job_id: UUID
    request_sha256: str
    environment_sha256: str
    artifact_sha256: dict[str, str]
    created_at: str
