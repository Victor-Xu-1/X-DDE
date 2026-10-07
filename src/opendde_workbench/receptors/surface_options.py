"""Observed-coordinate, heavy-atom solvent exposure; shared public/native options."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SurfaceRegion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    chain: str = Field(min_length=1, max_length=8, pattern=r"^[^\x00-\x1f\x7f]+$")
    number: int = Field(ge=-99999, le=999999)
    insertion_code: str = Field(default="", max_length=1, pattern=r"^[A-Za-z0-9]?$")
    resname: str = Field(min_length=1, max_length=8, pattern=r"^[A-Za-z0-9]+$")


class SurfaceOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    model_index: int = Field(default=0, ge=0, le=99)
    context_chains: tuple[str, ...] = Field(default=(), max_length=16)
    probe_radius_angstrom: float = Field(default=1.4, ge=0.5, le=3.0, allow_inf_nan=False)
    sphere_points: Literal[480, 960, 1920] = 960
    cpu: Literal[1] = 1
    memory_mib: int = Field(default=2048, ge=512, le=4096)

    @model_validator(mode="after")
    def chains(self):
        if len(set(self.context_chains)) != len(self.context_chains) or any(
            not c or len(c) > 8 or any(ord(x) < 32 or ord(x) == 127 for x in c)
            for c in self.context_chains
        ):
            raise ValueError("Choose unique explicit context chain identifiers.")
        return self
