"""Shared public/native molecular-state preparation options."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StateOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    protonation: bool = True
    ph_min: float = Field(default=6.4, ge=0, le=14, allow_inf_nan=False)
    ph_max: float = Field(default=8.4, ge=0, le=14, allow_inf_nan=False)
    precision: float = Field(default=1.0, ge=0.1, le=3, allow_inf_nan=False)
    tautomers: bool = True
    stereoisomers: bool = True
    max_states: int = Field(default=16, ge=1, le=64)
    max_tautomers: int = Field(default=16, ge=1, le=64)
    max_stereoisomers: int = Field(default=8, ge=1, le=32)
    conformers_per_state: int = Field(default=3, ge=0, le=16)
    max_records: int = Field(default=64, ge=1, le=256)
    seed: int = Field(default=2026, ge=1, le=2147483647)
    prune_rmsd: float = Field(default=0.5, ge=0, le=5, allow_inf_nan=False)
    force_field: Literal["MMFF94s", "UFF", "none"] = "MMFF94s"
    optimization_iterations: int = Field(default=200, ge=10, le=2000)
    embedding_iterations: int = Field(default=500, ge=10, le=2000)
    cpu: int = Field(default=1, ge=1, le=2)
    memory_mib: int = Field(default=2048, ge=512, le=8192)

    @model_validator(mode="after")
    def budget(self):
        if self.ph_min > self.ph_max:
            raise ValueError("Minimum pH cannot exceed maximum pH.")
        if self.max_states * max(1, self.conformers_per_state) > self.max_records:
            raise ValueError("State/conformer choices exceed the total record budget.")
        return self
