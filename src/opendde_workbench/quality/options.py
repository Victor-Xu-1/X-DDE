"""Fixed native profiles with bounded CPU resources; no arbitrary threshold/config injection."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class QualityOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    profile: Literal["mol", "dock", "redock"] = "mol"
    cpu: int = Field(default=1, ge=1, le=2)
    memory_mib: int = Field(default=2048, ge=512, le=8192)
