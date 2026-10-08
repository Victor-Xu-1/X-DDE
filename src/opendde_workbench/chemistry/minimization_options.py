"""Bounded force-field settings, shared with the isolated native interpreter."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MinimizationOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    force_field: Literal["MMFF94s", "UFF"] = "MMFF94s"
    initialize_3d: bool = Field(default=False, strict=True)
    seed: int = Field(default=2026, strict=True, ge=1, le=2147483647)
    max_iterations: int = Field(default=1000, strict=True, ge=1, le=2000)
    cpu: int = Field(default=1, strict=True, ge=1, le=8)
    memory_mib: int = Field(default=2048, strict=True, ge=1024, le=8192)
    time_limit_seconds: int = Field(default=120, strict=True, ge=30, le=600)
