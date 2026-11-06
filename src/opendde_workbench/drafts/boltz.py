"""Boltz editor state keeps exact sources but never persists verified readiness."""

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from .snapshot import Number, SnapshotModel, bounded_state


class Reference(SnapshotModel):
    asset_id: UUID
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    record: Number
    conformer: Number
    version_id: UUID | None = None


class BoltzEntity(SnapshotModel):
    id: str = Field(max_length=32)
    kind: Literal["protein", "ligand", "rna", "dna"]
    value: str = Field(max_length=50000)
    source: Reference | None = None
    msa: Reference | None = None
    msa_mode: Literal["provided", "single"] | None = None


class BoltzSettings(SnapshotModel):
    kind: Literal["boltz"]
    samples: Number
    recycling_steps: Number
    sampling_steps: Number
    affinity: bool = Field(strict=True)


class BoltzOptions(SnapshotModel):
    device: Literal["cpu", "cuda"]
    cpu: Number
    memory_mib: Number
    seed: Number


class BoltzState(SnapshotModel):
    name: str = Field(max_length=80)
    components: list[BoltzEntity] = Field(max_length=32)
    settings: BoltzSettings
    options: BoltzOptions
    expert: bool = Field(strict=True)

    @model_validator(mode="after")
    def bounded_snapshot(self):
        return bounded_state(self)

    def asset_ids(self):
        return {
            str(reference.asset_id)
            for entity in self.components
            for reference in (entity.source, entity.msa)
            if reference is not None
        }
