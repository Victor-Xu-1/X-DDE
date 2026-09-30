"""Typed independent output checks retain units and violating output coordinates."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from ..scientific_objects import ScientificModel

Finite = Annotated[float, Field(allow_inf_nan=False)]
Nonnegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class BoundsViolation(ScientificModel):
    output_atom_index: int | None = Field(default=None, strict=True, ge=0, le=4999)
    position: tuple[Finite, Finite, Finite]
    excess: tuple[Nonnegative, Nonnegative, Nonnegative]

    @model_validator(mode="after")
    def outside(self) -> Self:
        if not any(self.excess):
            raise ValueError("A violation must retain actual nonzero excess.")
        return self


class BoundsCheck(ScientificModel):
    condition_id: UUID
    validator: Literal["rdkit_receptor_bounds_v1"]
    selection: Literal["heavy_atom_centroid", "all_heavy_atoms"]
    strength: Literal["hard", "soft"]
    weight: float | None = Field(default=None, gt=0, le=1000, allow_inf_nan=False)
    unit: Literal["angstrom"]
    passed: bool = Field(strict=True)
    tolerance_angstrom: float = Field(ge=0, le=0.1, allow_inf_nan=False)
    checked_points: int = Field(strict=True, ge=1, le=256)
    violations: tuple[BoundsViolation, ...] = Field(max_length=256)
    maximum_excess: Nonnegative
    weighted_deviation: Nonnegative | None = None

    @model_validator(mode="after")
    def consistent(self) -> Self:
        if self.passed != (not self.violations) or len(self.violations) > self.checked_points:
            raise ValueError("Output-check status disagrees with its real violating coordinates.")
        maximum = max((max(v.excess) for v in self.violations), default=0.0)
        if self.maximum_excess != maximum:
            raise ValueError("Output-check maximum differs from its violations.")
        if self.selection == "heavy_atom_centroid":
            if self.checked_points != 1 or any(
                v.output_atom_index is not None for v in self.violations
            ):
                raise ValueError("Centroid checks do not claim an individual atom identity.")
        elif any(v.output_atom_index is None for v in self.violations) or len(
            {v.output_atom_index for v in self.violations}
        ) != len(self.violations):
            raise ValueError("Atom checks need distinct real output atom indices.")
        if self.strength == "hard":
            if self.weight is not None or self.weighted_deviation is not None:
                raise ValueError("Hard conditions do not have soft deviation weights.")
        elif self.weight is None or self.weighted_deviation != self.maximum_excess * self.weight:
            raise ValueError("Soft deviations require their actual weighted geometric excess.")
        return self
