"""Versioned UI snapshots deliberately allow unfinished scientific inputs."""

from typing import Literal

from pydantic import Field, JsonValue, model_validator

from .boltz import BoltzState
from .entities import Bond, Entity, entity_asset_ids
from .entities import BondAtom as BondAtom
from .entities import Modification as Modification
from .opendde import OpenDdeState
from .snapshot import Number, SnapshotModel, bounded_state

DraftTool = Literal["mol1.predict", "boltz.predict", "predict"]


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
        return entity_asset_ids(self.components)


STATES = {"mol1.predict": Mol1State, "boltz.predict": BoltzState, "predict": OpenDdeState}


class DraftInput(SnapshotModel):
    tool: DraftTool
    schema_version: Literal[1]
    revision: int = Field(ge=0)
    state: Mol1State | BoltzState | OpenDdeState

    @model_validator(mode="after")
    def matching_editor(self):
        expected = STATES[self.tool]
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
    state: Mol1State | BoltzState | OpenDdeState

    @model_validator(mode="after")
    def matching_editor(self):
        expected = STATES[self.tool]
        if not isinstance(self.state, expected):
            raise ValueError("Draft state does not match its prediction model.")
        return self


class ArchiveInput(SnapshotModel):
    revision: int = Field(ge=1)
    archived: bool
