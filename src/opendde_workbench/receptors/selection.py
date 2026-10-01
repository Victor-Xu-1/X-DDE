"""Shared public/native selection and bounded alignment options."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ResidueAddress(Model):
    chain: str = Field(min_length=1, max_length=8, pattern=r"^[^\x00-\x1f\x7f]+$")
    number: int = Field(ge=-99999, le=999999)
    insertion_code: str = Field(default="", max_length=1, pattern=r"^[A-Za-z0-9]?$")


class ResiduePair(Model):
    reference: ResidueAddress
    moving: ResidueAddress


class ChainPair(Model):
    reference: str = Field(min_length=1, max_length=8, pattern=r"^[^\x00-\x1f\x7f]+$")
    moving: str = Field(min_length=1, max_length=8, pattern=r"^[^\x00-\x1f\x7f]+$")


class MemberSelection(Model):
    model_index: int = Field(default=0, ge=0, le=99)
    chains: tuple[str, ...] = Field(default=(), max_length=16)
    profile: Literal["unspecified", "experimental", "predicted"] = "unspecified"
    chain_pairs: tuple[ChainPair, ...] = Field(default=(), max_length=16)
    residue_pairs: tuple[ResiduePair, ...] = Field(default=(), max_length=5000)

    @model_validator(mode="after")
    def unambiguous(self):
        if len(set(self.chains)) != len(self.chains) or any(
            not c or len(c) > 8 or any(ord(x) < 32 or ord(x) == 127 for x in c) for c in self.chains
        ):
            raise ValueError("Choose unique, explicit structural chain identifiers.")
        if self.chain_pairs and self.residue_pairs:
            raise ValueError("Choose chain correspondence or explicit residue anchors, not both.")
        for pairs in (self.chain_pairs, self.residue_pairs):
            if len({p.reference for p in pairs}) != len(pairs) or len(
                {p.moving for p in pairs}
            ) != len(pairs):
                raise ValueError("Alignment correspondence must be one-to-one.")
        return self


class EnsembleOptions(Model):
    reference_index: int = Field(default=0, ge=0, le=15)
    minimum_pairs: int = Field(default=8, ge=3, le=5000)
    minimum_identity: float = Field(default=1.0, ge=0.5, le=1.0, allow_inf_nan=False)
    minimum_coverage: float = Field(default=0.7, ge=0.1, le=1.0, allow_inf_nan=False)
    maximum_rmsd_angstrom: float = Field(default=3.0, ge=0.1, le=30, allow_inf_nan=False)
    require_complete_backbone: bool = True
    cpu: int = Field(default=1, ge=1, le=2)
    memory_mib: int = Field(default=2048, ge=512, le=8192)
