"""Validate reported C-alpha evidence in its single, target-conditioned rigid frame."""

import math
from typing import Literal

from pydantic import Field, model_validator

from ..receptors.result import Transformation
from ..receptors.selection import ResidueAddress, ResiduePair
from .options import ComparisonModel

Vector = tuple[float, float, float]


class Displacement(ComparisonModel):
    role: Literal["target", "partner"]
    reference: ResidueAddress
    moving: ResidueAddress
    reference_letter: str = Field(pattern=r"^[A-Z]$")
    moving_letter: str = Field(pattern=r"^[A-Z]$")
    reference_position: Vector
    moving_source_position: Vector
    moving_aligned_position: Vector
    displacement_angstrom: float = Field(ge=0)


class ComparisonGeometry(ComparisonModel):
    rotation: tuple[Vector, Vector, Vector]
    translation: Vector
    convention: Literal["row_xyz_times_rotation_plus_translation"]
    target_rmsd_angstrom: float = Field(ge=0)
    partner_rmsd_angstrom: float = Field(ge=0)
    matched_target_ca: int = Field(strict=True, ge=3, le=5000)
    matched_partner_ca: int = Field(strict=True, ge=3, le=5000)
    residue_displacements: tuple[Displacement, ...] = Field(min_length=6, max_length=10000)

    @model_validator(mode="after")
    def single_frame(self):
        target = [row for row in self.residue_displacements if row.role == "target"]
        partner = [row for row in self.residue_displacements if row.role == "partner"]
        if (len(target), len(partner)) != (self.matched_target_ca, self.matched_partner_ca):
            raise ValueError("Comparison counts differ from the complete residue inventory.")
        Transformation(
            rotation=self.rotation,
            translation=self.translation,
            convention=self.convention,
            rmsd_angstrom=self.target_rmsd_angstrom,
            residue_pairs=tuple(
                ResiduePair(reference=row.reference, moving=row.moving) for row in target
            ),
        )
        for side in ("reference", "moving"):
            identities = [getattr(row, side) for row in self.residue_displacements]
            if len(set(identities)) != len(identities):
                raise ValueError("Comparison residue correspondence must be one-to-one.")
        for row in self.residue_displacements:
            aligned = tuple(
                sum(row.moving_source_position[k] * self.rotation[k][j] for k in range(3))
                + self.translation[j]
                for j in range(3)
            )
            if math.dist(aligned, row.moving_aligned_position) > 1e-6 or not math.isclose(
                math.dist(row.reference_position, row.moving_aligned_position),
                row.displacement_angstrom,
                rel_tol=1e-10,
                abs_tol=1e-6,
            ):
                raise ValueError("Residue evidence does not use the declared target-fitted frame.")
        for rows, rmsd in (
            (target, self.target_rmsd_angstrom),
            (partner, self.partner_rmsd_angstrom),
        ):
            expected = math.sqrt(sum(row.displacement_angstrom**2 for row in rows) / len(rows))
            if not math.isclose(expected, rmsd, rel_tol=1e-10, abs_tol=1e-6):
                raise ValueError("Reported RMSD differs from its evaluated residue inventory.")
        return self
