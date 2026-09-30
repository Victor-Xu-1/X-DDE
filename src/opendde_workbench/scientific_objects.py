"""Versioned scientific references, independent of any viewer or execution engine."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class ScientificModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class MoleculeRef(ScientificModel):
    asset_id: UUID
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    record: int = Field(default=0, ge=0, le=499)
    conformer: int = Field(default=0, ge=0, le=999)
    version_id: UUID | None = None


class AtomRef(ScientificModel):
    molecule: MoleculeRef
    index: int = Field(ge=0, le=999999)


class ResidueRef(ScientificModel):
    structure: MoleculeRef
    model: int = Field(default=0, ge=0, le=999)
    chain: str = Field(min_length=1, max_length=32)
    number: int = Field(ge=-99999, le=999999)
    insertion_code: str = Field(default="", max_length=4)
    alternate_location: str = Field(default="", max_length=4)

    def diffsbdd_id(self) -> str:
        # Reject identities that the native PDB adapter cannot represent, rather than truncate.
        if (
            self.model != 0
            or len(self.chain) != 1
            or not self.chain.isascii()
            or not self.chain.isalnum()
            or self.insertion_code
            or self.alternate_location
        ):
            raise ValueError(
                "DiffSBDD requires a single PDB model, one-character chain IDs, "
                "and residues without insertion codes or unresolved alternate locations."
            )
        return f"{self.chain}:{self.number}"


class Constraint(ScientificModel):
    id: UUID
    kind: Literal["fixed_atoms", "preserve_bonds", "pocket_residues"]
    support: Literal["native", "adapter", "result_check", "unsupported"]
    strength: Literal["hard", "soft"] = "hard"
    phase: Literal["input", "sampling", "result"]
    atoms: tuple[AtomRef, ...] = ()
    residues: tuple[ResidueRef, ...] = ()

    @model_validator(mode="after")
    def has_targets(self) -> Self:
        if self.kind in {"fixed_atoms", "preserve_bonds"} and not self.atoms:
            raise ValueError("Atom constraints require explicit versioned atom references.")
        if self.kind == "pocket_residues" and not self.residues:
            raise ValueError("Pocket constraints require explicit residue references.")
        return self


class Measurement(ScientificModel):
    name: str = Field(min_length=1, max_length=80)
    value: float = Field(allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=40)
    method: str = Field(min_length=1, max_length=120)
    software: str = Field(min_length=1, max_length=80)
    software_version: str = Field(min_length=1, max_length=80)
    source_job: UUID
    molecule: MoleculeRef
    meaning: Literal["descriptor", "geometry", "confidence", "score", "observation"]
