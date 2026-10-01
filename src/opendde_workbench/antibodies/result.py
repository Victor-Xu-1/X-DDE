"""Typed native domains, exact original sequence identity and immutable domain FASTA bytes."""

import hashlib
import re
from typing import Literal

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from .fasta import read_fasta
from .native_numbering import region
from .options import NumberingOptions


class SequenceRecord(ScientificModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    sequence: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWYX]{20,2000}$")


class NumberedResidue(ScientificModel):
    number: int = Field(ge=1, le=128)
    insertion: str = Field(max_length=4, pattern=r"^[A-Za-z]*$")
    amino_acid: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWYX]$")
    source_position: int = Field(ge=1, le=2000)
    region: Literal["CDR1", "CDR2", "CDR3", "framework"]


class Domain(ScientificModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    source_id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    available: bool
    chain_type: Literal["H", "K", "L", "F"] | None
    score: float | None = Field(default=None, allow_inf_nan=False)
    start: int | None = Field(default=None, ge=0, le=1999)
    end: int | None = Field(default=None, ge=0, le=1999)
    sequence: str | None = Field(default=None, max_length=2000)
    numbering: tuple[NumberedResidue, ...] = Field(max_length=2000)
    artifact: str | None = Field(default=None, pattern=r"^domain-[0-9]{3}\.fasta$")
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def availability(self):
        if self.available:
            if (
                self.start is None
                or self.end is None
                or self.start > self.end
                or not self.sequence
                or not self.numbering
                or not self.artifact
                or not self.sha256
                or self.reason
                or self.chain_type not in {"H", "K", "L"}
                or self.score is None
            ):
                raise ValueError("Numbered domain evidence is incomplete.")
        elif (
            not self.reason
            or any(
                value is not None
                for value in (self.start, self.end, self.sequence, self.artifact, self.sha256)
            )
            or self.numbering
        ):
            raise ValueError(
                "Unnumbered sequence requires an explicit failure without fabricated domain data."
            )
        return self


class AntibodyNumberResult(ScientificModel):
    operation: Literal["antibody_number"]
    complete: Literal[True]
    schema_version: Literal[1]
    source: MoleculeRef
    options: NumberingOptions
    input_records: tuple[SequenceRecord, ...] = Field(min_length=1, max_length=50)
    domains: tuple[Domain, ...] = Field(min_length=1, max_length=100)
    versions: dict[str, str]
    weights_sha256: dict[str, str]
    scheme: Literal["imgt"]
    source_positions: Literal["one_based_inclusive"]
    native_interval: Literal["zero_based_inclusive"]
    scope: Literal["antibody_numbering_and_chain_domains_not_humanness_binding_or_developability"]

    @model_validator(mode="after")
    def identity(self):
        records = {record.id: record.sequence for record in self.input_records}
        if (
            len(records) != len(self.input_records)
            or {domain.source_id for domain in self.domains} != set(records)
            or len({domain.id for domain in self.domains}) != len(self.domains)
        ):
            raise ValueError("Native report omitted or duplicated an input/domain identity.")
        for domain in self.domains:
            sequence = records[domain.source_id]
            if domain.available:
                if (
                    domain.end >= len(sequence)
                    or sequence[domain.start : domain.end + 1] != domain.sequence
                ):
                    raise ValueError(
                        "Native domain sequence differs from its original inclusive interval."
                    )
                if [row.source_position for row in domain.numbering] != list(
                    range(domain.start + 1, domain.end + 2)
                ) or "".join(row.amino_acid for row in domain.numbering) != domain.sequence:
                    raise ValueError("Residue source positions/sequence are inconsistent.")
                if len({(row.number, row.insertion) for row in domain.numbering}) != len(
                    domain.numbering
                ) or any(row.region != region(row.number) for row in domain.numbering):
                    raise ValueError("IMGT numbering/CDR annotation is inconsistent.")
        expected = {
            f"antibody_4_{layers}_128_512.{suffix}"
            for layers in (1, 2)
            for suffix in ("json", "pt")
        }
        if set(self.weights_sha256) != expected or any(
            not re.fullmatch(r"[a-f0-9]{64}", sha) for sha in self.weights_sha256.values()
        ):
            raise ValueError("Native bundled model evidence is incomplete.")
        return self


def validate_numbering(value, task, output, source_file=None):
    result = AntibodyNumberResult.model_validate(value)
    if (
        result.source != task.sequences
        or result.options != task.options
        or result.versions != {"anarcii": "2.0.8", "torch": "2.8.0+cpu"}
    ):
        raise ValueError("Antibody sequence/options/software differ from the selected task.")
    if source_file is None:
        name = str(task.sequences.asset_id)
        folder = output.parent / "assets"
        source_file = contained(
            folder, name + ".fasta" if (folder / (name + ".fasta")).is_file() else name + ".fa"
        )
    raw = source_file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != task.sequences.sha256 or read_fasta(raw) != [
        row.model_dump() for row in result.input_records
    ]:
        raise ValueError("Original sequence snapshot changed or differs from the native result.")
    for index, domain in enumerate(result.domains):
        if not domain.available:
            continue
        if domain.artifact != f"domain-{index:03d}.fasta":
            raise ValueError("Domain artifact identity changed.")
        file = contained(output, domain.artifact)
        expected = (">" + domain.id + "\n" + domain.sequence + "\n").encode()
        if file.read_bytes() != expected or hashlib.sha256(expected).hexdigest() != domain.sha256:
            raise ValueError("Saved domain sequence bytes changed.")
    return result
