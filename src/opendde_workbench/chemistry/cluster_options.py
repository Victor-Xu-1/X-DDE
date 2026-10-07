"""Bounded scientific controls shared by the platform and isolated native adapter."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ClusterOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    criterion: Literal["geometry", "contacts", "both"] = "both"
    maximum_rmsd_angstrom: float = Field(
        default=2.0, strict=True, ge=0.1, le=10, allow_inf_nan=False
    )
    minimum_contact_jaccard: float = Field(
        default=0.5, strict=True, ge=0.05, le=1, allow_inf_nan=False
    )
    contact_cutoff_angstrom: float = Field(
        default=4.5, strict=True, ge=2, le=6, allow_inf_nan=False
    )
    minimum_contact_mapping: float = Field(
        default=0.7, strict=True, ge=0.1, le=1, allow_inf_nan=False
    )
    maximum_symmetry_maps: int = Field(default=1000, strict=True, ge=1, le=1000)
    cpu: int = Field(default=1, strict=True, ge=1, le=2)
    memory_mib: int = Field(default=2048, strict=True, ge=1024, le=4096)
