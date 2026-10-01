"""Research identifiers are selected explicitly; source queries never carry arbitrary URLs."""

from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..task_metadata import TaskMetadata


class EvidenceLookup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: Literal["target", "disease"]
    query: str = Field(min_length=2, max_length=120, pattern=r"^[^\x00-\x1f\x7f]+$")
    allow_external: Literal[True]

    @field_validator("query")
    @classmethod
    def visible_query(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Enter at least two visible search characters.")
        return value.strip()


class TargetResearchTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["target_research"] = "target_research"
    name: str = Field(
        default="Target evidence", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    project_id: UUID | None = None
    entity: Literal["target", "disease"]
    identifier: str = Field(min_length=3, max_length=40)
    include_materials: bool = True
    limit: int = Field(default=20, ge=5, le=50)
    allow_external: Literal[True]

    @model_validator(mode="after")
    def identity(self) -> Self:
        import re

        pattern = (
            r"ENSG[0-9]{11}"
            if self.entity == "target"
            else r"[A-Za-z][A-Za-z0-9]{1,15}_[A-Za-z0-9]{1,24}"
        )
        if not re.fullmatch(pattern, self.identifier):
            raise ValueError("Select a valid Open Targets identifier from the search results.")
        if self.constraints or self.scientific_inputs:
            raise ValueError(
                "Evidence retrieval uses a database identifier, not molecular constraints."
            )
        return self
