"""Versioned UI snapshots deliberately allow unfinished scientific inputs."""

import json
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

Number = Annotated[float, Field(allow_inf_nan=False, ge=-1e12, le=1e12)]


class SnapshotModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Modification(SnapshotModel):
    position: Number
    ccd: str = Field(max_length=32)


class Entity(SnapshotModel):
    kind: Literal["protein", "ligand", "dna", "rna", "ion"]
    value: str = Field(max_length=50000)
    count: Number
    chain_ids: list[Annotated[str, Field(max_length=32)]] | None = Field(
        default=None, max_length=32
    )
    modifications: list[Modification] | None = Field(default=None, max_length=5000)
    source_sequence: UUID | None = None
    ligand_file: UUID | None = None
    paired_msa: UUID | None = None
    unpaired_msa: UUID | None = None
    template_hits: UUID | None = None


class BondAtom(SnapshotModel):
    entity: Number
    copy_index: Number | None
    position: Number
    atom: str = Field(max_length=80)


class Bond(SnapshotModel):
    left: BondAtom
    right: BondAtom


class Mol1State(SnapshotModel):
    name: str = Field(max_length=80)
    components: list[Entity] = Field(max_length=32)
    settings: dict[str, JsonValue] = Field(max_length=32)
    bonds: list[Bond] = Field(max_length=256)
    advanced: bool
    seed_text: str = Field(max_length=1000)
    device: Literal["cpu", "cuda"]
    memory: Number
    seed: Number

    @model_validator(mode="after")
    def bounded_snapshot(self):
        # Native settings validation still happens only when submitting a task.
        # Refuse non-finite JSON and unreasonable nested UI metadata at this boundary.
        def visit(value, depth=0):
            if depth > 8:
                raise ValueError("Draft settings exceed the supported nesting depth.")
            if isinstance(value, dict):
                if len(value) > 64:
                    raise ValueError("Too many draft settings.")
                for key, item in value.items():
                    if len(key) > 80:
                        raise ValueError("Draft setting name is too long.")
                    visit(item, depth + 1)
            elif isinstance(value, list):
                if len(value) > 5000:
                    raise ValueError("Too many draft values.")
                for item in value:
                    visit(item, depth + 1)
            elif isinstance(value, str) and len(value) > 50000:
                raise ValueError("Draft value is too long.")

        visit(self.settings)
        if "additional_seeds" in self.settings:
            raise ValueError("Additional seeds belong in the lossless seed_text editor field.")
        try:
            body = json.dumps(self.model_dump(mode="json"), allow_nan=False)
        except ValueError as exc:
            raise ValueError("Draft values must be finite JSON.") from exc
        if len(body.encode()) > 200000:
            raise ValueError("Draft exceeds the 200 kB snapshot limit.")
        return self

    def asset_ids(self):
        return {
            str(identifier)
            for entity in self.components
            for field in (
                "source_sequence",
                "ligand_file",
                "paired_msa",
                "unpaired_msa",
                "template_hits",
            )
            if (identifier := getattr(entity, field)) is not None
        }


class DraftInput(SnapshotModel):
    tool: Literal["mol1.predict"]
    schema_version: Literal[1]
    revision: int = Field(ge=0)
    state: Mol1State


class DraftSummary(SnapshotModel):
    id: str
    tool: Literal["mol1.predict"]
    schema_version: Literal[1]
    revision: int
    name: str
    entities: int
    created_at: str
    updated_at: str
    archived: bool


class Draft(DraftSummary):
    state: Mol1State


class ArchiveInput(SnapshotModel):
    revision: int = Field(ge=1)
    archived: bool
