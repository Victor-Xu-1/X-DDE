"""Explicit stable native geometry and bounded resource choices, without executable text."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ChannelOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    model_index: int = Field(default=0, strict=True, ge=0, le=99)
    context_chains: tuple[str, ...] = Field(default=(), max_length=16)
    remove_starting_ligands: bool = Field(default=True, strict=True)
    alternate: str = Field(default="A", pattern=r"^(reject|[A-Za-z0-9])$")
    probe_radius_angstrom: float = Field(
        default=0.9, strict=True, ge=0.5, le=3, allow_inf_nan=False
    )
    shell_radius_angstrom: float = Field(default=5, strict=True, ge=3, le=10, allow_inf_nan=False)
    shell_depth_angstrom: float = Field(default=4, strict=True, ge=1, le=8, allow_inf_nan=False)
    maximum_start_displacement_angstrom: float = Field(
        default=3, strict=True, ge=0.5, le=5, allow_inf_nan=False
    )
    profile_step_angstrom: Literal[0.25, 0.5, 1.0] = 0.5
    maximum_candidates: int = Field(default=500, strict=True, ge=10, le=500)
    cpu: Literal[1, 2] = 2
    memory_mib: int = Field(default=2048, strict=True, ge=1536, le=4096)
    timeout_seconds: int = Field(default=180, strict=True, ge=30, le=900)

    @field_validator("cpu", "profile_step_angstrom", mode="before")
    @classmethod
    def real_numbers(cls, value):
        if isinstance(value, bool):
            raise ValueError("Use a numeric resource or sampling choice, never a boolean.")
        return value

    @model_validator(mode="after")
    def context(self):
        if len(set(self.context_chains)) != len(self.context_chains) or any(
            not chain or len(chain) > 8 or any(ord(c) < 32 or ord(c) == 127 for c in chain)
            for chain in self.context_chains
        ):
            raise ValueError("Choose unique explicit context chain identities.")
        if self.shell_radius_angstrom < self.probe_radius_angstrom:
            raise ValueError("The bulk-solvent shell must contain the declared geometric probe.")
        return self
