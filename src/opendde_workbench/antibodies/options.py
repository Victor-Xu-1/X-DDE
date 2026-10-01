"""Shared native/public numbering choices and bounded CPU resources."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class NumberingOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    mode: Literal["accuracy", "speed"] = "accuracy"
    scfv: bool = False
    cpu: int = Field(default=1, ge=1, le=2)
    memory_mib: int = Field(default=4096, ge=2048, le=8192)
