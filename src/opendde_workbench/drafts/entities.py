"""Shared lossless draft entities; native admission remains engine-specific."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from .snapshot import Number, SnapshotModel

ASSET_FIELDS = ("source_sequence", "ligand_file", "paired_msa", "unpaired_msa", "template_hits")


class Modification(SnapshotModel):
    position: Number
    ccd: str = Field(max_length=32)


class Entity(SnapshotModel):
    kind: Literal["protein", "ligand", "dna", "rna", "ion"]
    value: str = Field(max_length=50000)
    count: Number
    chain_ids: list[Annotated[str, Field(max_length=32)]] | None = Field(
        default=None, max_length=32
    )
    modifications: list[Modification] | None = Field(default=None, max_length=5000)
    source_sequence: UUID | None = None
    ligand_file: UUID | None = None
    paired_msa: UUID | None = None
    unpaired_msa: UUID | None = None
    template_hits: UUID | None = None


class BondAtom(SnapshotModel):
    entity: Number
    copy_index: Number | None
    position: Number
    atom: str = Field(max_length=80)


class Bond(SnapshotModel):
    left: BondAtom
    right: BondAtom


class Reference(SnapshotModel):
    asset_id: UUID
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    record: Number
    conformer: Number
    version_id: UUID | None = None


def entity_asset_ids(entities):
    return {
        str(identifier)
        for entity in entities
        for field in ASSET_FIELDS
        if (identifier := getattr(entity, field)) is not None
    }
