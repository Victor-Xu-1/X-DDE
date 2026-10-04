"""Bounded deterministic small-library choices; descriptors are not ADMET predictions."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScreenOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    mode: Literal[
        "inventory", "similarity", "substructure", "diversity", "filter", "alerts", "scaffold"
    ] = "inventory"
    max_selected: int = Field(default=20, ge=1, le=100)
    minimum_similarity: float = Field(default=0.6, ge=0, le=1, allow_inf_nan=False)
    deduplicate: bool = True
    minimum_mw: float = Field(default=100, ge=0, le=5000, allow_inf_nan=False)
    maximum_mw: float = Field(default=700, ge=1, le=5000, allow_inf_nan=False)
    minimum_logp: float = Field(default=-3, ge=-20, le=20, allow_inf_nan=False)
    maximum_logp: float = Field(default=7, ge=-20, le=20, allow_inf_nan=False)
    alert_policy: Literal["off", "warn", "exclude"] = "off"
    alert_catalogue: Literal["pains", "pains_brenk"] = "pains_brenk"
    per_scaffold: int = Field(default=1, ge=1, le=10)
    seed: int = Field(default=2026, ge=1, le=2147483647)
    cpu: int = Field(default=1, ge=1, le=2)
    memory_mib: int = Field(default=2048, ge=512, le=8192)

    @model_validator(mode="after")
    def ranges(self):
        if self.minimum_mw > self.maximum_mw or self.minimum_logp > self.maximum_logp:
            raise ValueError("Minimum descriptor limits cannot exceed maximum limits.")
        if self.mode == "alerts" and self.alert_policy == "off":
            raise ValueError("Structural-alert review requires an explicit warn or exclude policy.")
        return self
