"""Only bounded, identity-preserving native output can become a new saved pose."""

import hashlib
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from .minimization_options import MinimizationOptions


class MoleculeMinimizeResult(ScientificModel):
    operation: Literal["molecule_minimize"]
    complete: Literal[True]
    schema_version: Literal[1]
    source: MoleculeRef
    options: MinimizationOptions
    method: Literal["MMFF94s", "UFF"]
    geometry_frame: Literal["unbound_pose"]
    energy_before: float = Field(allow_inf_nan=False)
    energy_after: float = Field(allow_inf_nan=False)
    energy_unit: Literal["kcal/mol"]
    energy_basis: Literal["hydrogen_completed_same_state"]
    converged: bool = Field(strict=True)
    artifact: Literal["minimized.sdf"]
    artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_atom_count: int = Field(ge=2, le=256)
    output_atom_count: int = Field(ge=2, le=1024)
    source_to_pose_atoms: tuple[int, ...] = Field(min_length=2, max_length=256)
    identity_smiles: str = Field(min_length=1, max_length=20000)
    identity_preserved: Literal[True]
    coordinate_stereo_preserved: Literal[True]
    software_version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+.*$", max_length=80)

    @model_validator(mode="after")
    def consistency(self) -> Self:
        if self.method != self.options.force_field or self.energy_after > self.energy_before + 1e-3:
            raise ValueError("Optimized pose method or energy evidence is inconsistent.")
        if (
            self.source_to_pose_atoms != tuple(range(self.source_atom_count))
            or self.output_atom_count < self.source_atom_count
        ):
            raise ValueError("Original pose atom identities were not preserved in order.")
        return self


def validate_minimization(value, request, output: Path):
    result = MoleculeMinimizeResult.model_validate(value)
    if result.source != request.molecule or result.options != request.options:
        raise ValueError("Optimized pose differs from the exact source/options snapshot.")
    file = contained(output, result.artifact)
    if file.stat().st_size > 2 * 1024**2:
        raise ValueError("Optimized pose exceeds its bounded file limit.")
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != result.artifact_sha256:
        raise ValueError("Optimized pose changed after native verification.")
    if len([v for v in raw.decode("utf-8").split("$$$$") if v.strip()]) != 1:
        raise ValueError("An optimized pose must contain exactly one molecular record.")
    return result
