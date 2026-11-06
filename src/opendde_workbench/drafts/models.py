"""Versioned UI snapshots deliberately allow unfinished scientific inputs."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, JsonValue, model_validator

from .boltz import BoltzState
from .snapshot import Number, SnapshotModel, bounded_state

DraftTool = Literal["mol1.predict", "boltz.predict"]


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
        if "additional_seeds" in self.settings:
            raise ValueError("Additional seeds belong in the lossless seed_text editor field.")
        return bounded_state(self)

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
    tool: DraftTool
    schema_version: Literal[1]
    revision: int = Field(ge=0)
    state: Mol1State | BoltzState

    @model_validator(mode="after")
    def matching_editor(self):
        expected = Mol1State if self.tool == "mol1.predict" else BoltzState
        if not isinstance(self.state, expected):
            raise ValueError("Draft state does not match its prediction model.")
        return self


class DraftSummary(SnapshotModel):
    id: str
    tool: DraftTool
    schema_version: Literal[1]
    revision: int
    name: str
    entities: int
    created_at: str
    updated_at: str
    archived: bool


class Draft(DraftSummary):
    state: Mol1State | BoltzState

    @model_validator(mode="after")
    def matching_editor(self):
        expected = Mol1State if self.tool == "mol1.predict" else BoltzState
        if not isinstance(self.state, expected):
            raise ValueError("Draft state does not match its prediction model.")
        return self


class ArchiveInput(SnapshotModel):
    revision: int = Field(ge=1)
    archived: bool
