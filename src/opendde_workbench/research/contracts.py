"""Scientific versions reference immutable files; editing never overwrites evidence."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..scientific_objects import MoleculeRef

ObjectKind = Literal["molecule", "structure", "sequence", "analysis", "pocket"]
Relationship = Literal["edited_from", "prepared_from", "derived_from"]


class VersionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    asset_id: UUID
    kind: ObjectKind
    label: str = Field(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f\x7f]+$")
    record: int = Field(default=0, ge=0, le=499)
    conformer: int = Field(default=0, ge=0, le=999)
    parent_id: UUID | None = None
    relation: Relationship = "derived_from"
    notes: str = Field(default="", max_length=3000)
    rating: int = Field(default=0, ge=0, le=5)


class ScientificObject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    family_id: UUID
    kind: ObjectKind
    label: str
    reference: MoleculeRef
    parent_id: UUID | None
    relation: Relationship
    notes: str
    rating: int
    source_job: UUID | None
    created_at: str
    validation: Literal[
        "file_integrity_only", "native_generated", "native_prepared", "native_edited"
    ]
