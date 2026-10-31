"""Bounded optional receptor-sidechain protocol; no new execution authority."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FlexibleResidue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    chain: str = Field(pattern=r"^[A-Za-z0-9]$")
    number: int = Field(strict=True, ge=-999, le=9999)
    insertion_code: str = Field(default="", pattern=r"^[A-Za-z0-9]?$")

    @property
    def token(self) -> str:
        return f"{self.chain}:{self.number}" + (
            ":" + self.insertion_code if self.insertion_code else ""
        )


class FlexibleReceptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    residues: tuple[FlexibleResidue, ...] = Field(min_length=1, max_length=8)

    @property
    def tokens(self) -> list[str]:
        return [residue.token for residue in self.residues]

    @model_validator(mode="after")
    def unique(self) -> Self:
        if len(set(self.tokens)) != len(self.residues):
            raise ValueError("Select each receptor residue once.")
        return self


Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class ReceptorRefinement(FlexibleReceptor):
    method: Literal["gnina_local_sidechains_v1"]
    input_receptor_artifact: Literal["input-receptor.pdb"]
    raw_receptor_artifact: Literal["native-flex-receptor.pdb"]
    raw_ligand_artifact: Literal["poses.sdf"]
    original_receptor_sha256: Digest
    raw_receptor_sha256: Digest
    receptor_sha256: Digest
    raw_ligand_sha256: Digest
    heavy_atom_count: int = Field(strict=True, ge=1, le=250000)
    moved_sidechain_atoms: int = Field(strict=True, ge=0, le=200)
    maximum_sidechain_displacement_angstrom: float = Field(ge=0, allow_inf_nan=False)
    native_fixed_max_displacement_angstrom: float = Field(ge=0, le=0.002, allow_inf_nan=False)
    native_backbone_max_displacement_angstrom: float = Field(ge=0, le=0.002, allow_inf_nan=False)
    convergence: Literal["not_reported"]
    geometry_check: Literal["residue_bonds_and_local_handedness_v1"]
    checked_bonds: int = Field(strict=True, ge=1, le=1024)
    checked_centers: int = Field(strict=True, ge=1, le=16)
    maximum_bond_length_change_angstrom: float = Field(ge=0, le=0.03, allow_inf_nan=False)
    local_handedness_preserved: Literal[True]
