"""Mechanism-aware choices for the reviewed core two-protein ternary model."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TernaryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal["deepternary"] = "deepternary"
    input_mode: Literal["binary_poses", "shared_complex"] = "binary_poses"
    mechanism: Literal["protac", "riptac", "proximity", "molecular_glue"] = "protac"
    partner_a_name: str = Field(
        default="Target protein", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    partner_b_name: str = Field(
        default="Recruiting partner", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    partner_a_chain: str = Field(min_length=1, max_length=1, pattern=r"^[A-Za-z0-9]$")
    partner_b_chain: str = Field(min_length=1, max_length=1, pattern=r"^[A-Za-z0-9]$")
    samples: Literal[3, 10, 20] = 3
    attempt_budget: int = Field(default=12, ge=3, le=60)
    wall_seconds: int = Field(default=600, ge=60, le=1800)
    arm_a_map: list[int] = Field(default_factory=list, max_length=256)
    arm_b_map: list[int] = Field(default_factory=list, max_length=256)
    binding_region_a: list[int] = Field(default_factory=list, max_length=256)
    binding_region_b: list[int] = Field(default_factory=list, max_length=256)
    ligand_correction: bool = True

    @model_validator(mode="after")
    def bounded(self) -> Self:
        if self.attempt_budget < self.samples or self.attempt_budget > self.samples * 4:
            raise ValueError(
                "Choose a finite attempt budget from the requested count "
                "up to four times that count."
            )
        for mapping in (
            self.arm_a_map,
            self.arm_b_map,
            self.binding_region_a,
            self.binding_region_b,
        ):
            if mapping and (
                len(mapping) < 3
                or len(set(mapping)) != len(mapping)
                or any(index < 0 or index > 999999 for index in mapping)
            ):
                raise ValueError(
                    "An explicit arm map assigns distinct original ligand atoms "
                    "in arm-record order."
                )
        if set(self.arm_a_map) & set(self.arm_b_map):
            raise ValueError("The two binding arms must not assign the same full-molecule atom.")
        if set(self.binding_region_a) & set(self.binding_region_b):
            raise ValueError("The two binding regions cannot overlap.")
        if self.mechanism == "molecular_glue":
            if any((self.arm_a_map, self.arm_b_map, self.binding_region_a, self.binding_region_b)):
                raise ValueError("Molecular-glue modeling has no compulsory pair of arm maps.")
        elif self.input_mode == "shared_complex":
            if (
                not (self.binding_region_a and self.binding_region_b)
                or self.arm_a_map
                or self.arm_b_map
            ):
                raise ValueError(
                    "Select both binding regions in the complete complex; "
                    "external arm maps are separate."
                )
        elif self.binding_region_a or self.binding_region_b:
            raise ValueError(
                "External binary poses use atom maps, not in-complex region selections."
            )
        return self
