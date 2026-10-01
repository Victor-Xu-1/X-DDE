"""Bounded CPU execution; display groups never change native model definitions."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AdmetOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    view: Literal["adme", "safety", "all"] = "all"
    cpu: int = Field(default=1, ge=1, le=2, strict=True)
    memory_mib: int = Field(default=4096, ge=2048, le=8192, strict=True)
