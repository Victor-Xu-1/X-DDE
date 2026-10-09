"""Bounded physical choices; native protocols own the scientific algorithms."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DynamicsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal["openmm"] = "openmm"
    mode: Literal["dynamics"] = "dynamics"
    production_ns: float = Field(default=10, ge=0.002, le=500)
    equilibration_ns: float = Field(default=0.1, ge=0.002, le=5)
    temperature_kelvin: float = Field(default=300, ge=273.15, le=330)
    salt_molar: float = Field(default=0.15, ge=0, le=0.5)
    ph: float = Field(default=7.4, ge=2, le=12)
    padding_nm: float = Field(default=1, ge=1, le=2)
    timestep_fs: Literal[1, 2] = 2
    frames: int = Field(default=100, ge=2, le=200)
    repeats: int = Field(default=1, ge=1, le=3)
    time_limit_seconds: int = Field(default=86400, ge=300, le=604800)
    output_bytes: int = Field(default=8 * 1024**3, ge=128 * 1024**2, le=64 * 1024**3)

    @model_validator(mode="after")
    def sampling(self) -> Self:
        if self.production_ns * 1_000_000 / self.timestep_fs < self.frames:
            raise ValueError("Trajectory sampling cannot exceed the simulated integration steps.")
        return self


class FreeEnergyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal["openfe"] = "openfe"
    mode: Literal["rbfe"] = "rbfe"
    stage: Literal["plan", "calculate"] = "plan"
    records: list[int] = Field(min_length=2, max_length=12)
    network: Literal["minimal", "redundant"] = "redundant"
    # The historical default is omitted from canonical task bytes so retained
    # OpenFE request/result hashes remain valid after adding this optional choice.
    atom_mapper: Literal["lomap", "kartograf"] = Field(
        default="lomap", exclude_if=lambda value: value == "lomap"
    )
    production_ns: float = Field(default=5, ge=0.02, le=50)
    equilibration_ns: float = Field(default=1, ge=0.02, le=5)
    repeats: int = Field(default=3, ge=1, le=6)
    lambda_windows: Literal[11, 16, 24] = 11
    temperature_kelvin: float = Field(default=298.15, ge=273.15, le=330)
    time_limit_seconds: int = Field(default=604800, ge=300, le=604800)
    output_bytes: int = Field(default=32 * 1024**3, ge=128 * 1024**2, le=64 * 1024**3)

    @model_validator(mode="after")
    def records_unique(self) -> Self:
        if len(set(self.records)) != len(self.records) or any(
            r < 0 or r > 99999 for r in self.records
        ):
            raise ValueError("Select distinct original ligand records for the free-energy network.")
        return self


class GromacsDynamicsPayload(DynamicsPayload):
    kind: Literal["gromacs"] = "gromacs"

    @model_validator(mode="after")
    def regular_sampling(self) -> Self:
        steps = round(self.production_ns * 1_000_000 / self.timestep_fs)
        if steps % self.frames:
            raise ValueError(
                "GROMACS sampling requires integration steps divisible by the saved frame count."
            )
        return self


def payload_tag(value):
    kind = value.get("kind") if isinstance(value, dict) else getattr(value, "kind", None)
    mode = value.get("mode") if isinstance(value, dict) else getattr(value, "mode", None)
    return "openmm_dynamics" if kind == "openmm" and mode == "dynamics" else kind
