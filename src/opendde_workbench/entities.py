"""Native molecular input contracts independent of transport and execution."""

import re
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

EntityKind = Literal["protein", "ligand", "dna", "rna", "ion"]
ION_CODES = {"MG", "ZN", "CA", "NA", "K", "CL", "MN", "FE", "CU", "CO"}


class Modification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    position: int = Field(ge=1, le=5000)
    ccd: str = Field(pattern=r"^CCD_[A-Z0-9]{1,12}$")


class Component(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: EntityKind
    value: str = Field(default="", max_length=5000)
    count: int = Field(default=1, ge=1, le=4)
    chain_ids: list[str] = Field(default_factory=list, max_length=4)
    modifications: list[Modification] = Field(default_factory=list, max_length=100)
    ligand_file: UUID | None = None
    paired_msa: UUID | None = None
    unpaired_msa: UUID | None = None
    template_hits: UUID | None = None

    @model_validator(mode="after")
    def validate_value(self) -> Self:
        self.value = self.value.strip()
        if self.chain_ids and (
            len(self.chain_ids) != self.count
            or len(set(self.chain_ids)) != len(self.chain_ids)
            or any(not re.fullmatch(r"[A-Za-z0-9]{1,8}", value) for value in self.chain_ids)
        ):
            raise ValueError("Provide one unique alphanumeric chain ID per copy.")
        if (self.paired_msa or self.template_hits) and self.kind != "protein":
            raise ValueError("Paired MSA and protein template hits require a protein component.")
        if self.unpaired_msa and self.kind not in {"protein", "rna"}:
            raise ValueError("MSA files require protein or RNA components.")
        if self.ligand_file:
            if self.kind != "ligand" or self.value:
                raise ValueError("A file ligand cannot also contain a SMILES/CCD value.")
        elif self.kind in {"protein", "dna", "rna"}:
            lines = self.value.splitlines()
            if (
                self.value.startswith(">")
                and sum(line.strip().startswith(">") for line in lines) == 1
            ):
                self.value = "".join(lines[1:])
            self.value = re.sub(r"\s+", "", self.value).upper()
            alphabets = {"protein": "ACDEFGHIKLMNPQRSTVWYX", "dna": "ATGCNX", "rna": "AUGCNX"}
            if not re.fullmatch(f"[{alphabets[self.kind]}]+", self.value):
                raise ValueError(
                    f"{self.kind.upper()} requires one sequence using {alphabets[self.kind]}."
                )
        elif self.kind == "ion":
            self.value = self.value.upper()
            if not re.fullmatch(r"[A-Z0-9]{1,4}", self.value):
                raise ValueError("Provide an ion CCD code of one to four letters/digits.")
        elif (
            not self.value
            or self.value.startswith("FILE_")
            or re.search(r"[\s\x00-\x1f]", self.value)
            or "://" in self.value
        ):
            raise ValueError(
                "Ligand must be SMILES or CCD; upload file ligands using the file selector."
            )
        if self.modifications:
            if self.kind not in {"protein", "dna", "rna"}:
                raise ValueError("Residue modifications require a polymer sequence.")
            positions = [item.position for item in self.modifications]
            if len(set(positions)) != len(positions) or max(positions) > len(self.value):
                raise ValueError("Modification positions must be distinct and within the sequence.")
        return self

    def native(self, assets: dict[str, str]) -> dict:
        entity, key = {
            "protein": ("proteinChain", "sequence"),
            "dna": ("dnaSequence", "sequence"),
            "rna": ("rnaSequence", "sequence"),
            "ligand": ("ligand", "ligand"),
            "ion": ("ion", "ion"),
        }[self.kind]
        data = {
            key: "FILE_" + assets[str(self.ligand_file)] if self.ligand_file else self.value,
            "count": self.count,
        }
        if self.chain_ids:
            data["id"] = self.chain_ids
        if self.modifications:
            code_key, position_key = (
                ("ptmType", "ptmPosition")
                if self.kind == "protein"
                else ("modificationType", "basePosition")
            )
            data["modifications"] = [
                {code_key: item.ccd, position_key: item.position} for item in self.modifications
            ]
        for field, native_key in [
            (self.paired_msa, "pairedMsaPath"),
            (self.unpaired_msa, "unpairedMsaPath"),
            (self.template_hits, "templatesPath"),
        ]:
            if field:
                data[native_key] = assets[str(field)]
        return {entity: data}


class BondAtom(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: int = Field(ge=1, le=8)
    copy_index: int | None = Field(default=1, ge=1, le=4)
    position: int = Field(default=1, ge=1, le=5000)
    atom: str = Field(pattern=r"^[A-Za-z0-9'_*+\-]{1,16}$")


class CovalentBond(BaseModel):
    model_config = ConfigDict(extra="forbid")
    left: BondAtom
    right: BondAtom

    def native(self) -> dict:
        result = {}
        for index, atom in enumerate((self.left, self.right), 1):
            result.update(
                {
                    f"entity{index}": str(atom.entity),
                    f"position{index}": str(atom.position),
                    f"atom{index}": int(atom.atom) if atom.atom.isdecimal() else atom.atom,
                }
            )
            if atom.copy_index is not None:
                result[f"copy{index}"] = atom.copy_index
        return result
