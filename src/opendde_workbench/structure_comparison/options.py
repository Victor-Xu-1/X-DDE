"""Shared, standalone public/native choices; chain roles are always explicit."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ComparisonModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class ChainMapping(ComparisonModel):
    reference: str = Field(min_length=1, max_length=8, pattern=r"^[^\s\x00-\x1f\x7f]+$")
    moving: str = Field(min_length=1, max_length=8, pattern=r"^[^\s\x00-\x1f\x7f]+$")


class ComparisonOptions(ComparisonModel):
    purpose: Literal["conformational_comparison", "model_validation"] = "conformational_comparison"
    reference_model: int = Field(default=0, strict=True, ge=0, le=99)
    moving_model: int = Field(default=0, strict=True, ge=0, le=99)
    target_mapping: tuple[ChainMapping, ...] = Field(min_length=1, max_length=4)
    partner_mapping: tuple[ChainMapping, ...] = Field(min_length=1, max_length=4)
    correspondence: Literal["sequence", "author_numbering"] = "sequence"
    minimum_identity: float = Field(default=0.9, ge=0.5, le=1)
    minimum_coverage: float = Field(default=0.7, ge=0.1, le=1)
    minimum_target_pairs: int = Field(default=12, strict=True, ge=3, le=5000)
    minimum_partner_pairs: int = Field(default=3, strict=True, ge=3, le=5000)
    cpu: int = Field(default=1, strict=True, ge=1, le=2)
    memory_mib: int = Field(default=2048, strict=True, ge=512, le=8192)

    @model_validator(mode="after")
    def distinct_roles(self):
        mappings = (*self.target_mapping, *self.partner_mapping)
        for side in ("reference", "moving"):
            chains = [getattr(pair, side) for pair in mappings]
            if len(set(chains)) != len(chains):
                raise ValueError(
                    "Chain mappings must be one-to-one and target/partner roles disjoint."
                )
        return self
