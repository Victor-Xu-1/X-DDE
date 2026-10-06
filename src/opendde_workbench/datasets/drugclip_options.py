"""Real six-fold DrugCLIP encoding/retrieval; scores never imply affinity or pose."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..docking.contract import Search
from ..scientific_objects import MoleculeRef


class DrugCLIPOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["drugclip"] = "drugclip"
    mode: Literal["index", "retrieve"]
    use: Literal["non_commercial"]
    batch_size: int = Field(default=32, ge=1, le=256)
    shard_rows: int = Field(default=50000, ge=10, le=250000)
    block_rows: int = Field(default=32768, ge=256, le=131072)
    top_k: int = Field(default=100, ge=1, le=1000)
    retain: int = Field(default=30, ge=1, le=500)
    score: Literal["fold_zscore", "mean_cosine"] = "fold_zscore"
    calibration_rows: int = Field(default=10000, ge=10, le=100000)
    receptor: MoleculeRef | None = None
    search: Search | None = None
    pocket_radius: float = Field(default=6.0, ge=3, le=12, allow_inf_nan=False)
    precision: Literal["float32", "float16"] = "float32"
    max_records: int = Field(default=10000000, ge=1, le=100000000)

    @model_validator(mode="after")
    def scientific_scope(self):
        if self.mode == "retrieve":
            if self.receptor is None or self.search is None or self.search.frame != self.receptor:
                raise ValueError("Select a pocket in the exact receptor version.")
            if self.retain > self.top_k:
                raise ValueError("Retain no more than the returned ranked molecules.")
        elif self.receptor is not None or self.search is not None:
            raise ValueError("Library encoding does not need a target or binding pose.")
        return self
