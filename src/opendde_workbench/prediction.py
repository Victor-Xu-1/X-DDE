"""Prediction requests compile validated entities to the native input schema."""

from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .entities import Component, CovalentBond
from .parameters import Parameters


class Prediction(BaseModel):
    operation: Literal["predict"] = "predict"
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    components: list[Component] = Field(min_length=1, max_length=8)
    parameters: Parameters = Field(default_factory=Parameters)
    project_id: UUID | None = None
    covalent_bonds: list[CovalentBond] = Field(default_factory=list, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip() or any(ord(char) < 32 for char in value):
            raise ValueError("Task name must contain visible text.")
        return value.strip()

    @model_validator(mode="after")
    def validate_assembly(self) -> Self:
        ids = [chain for component in self.components for chain in component.chain_ids]
        if len(set(ids)) != len(ids):
            raise ValueError("Chain IDs must be unique across all components.")
        seen = set()
        for bond in self.covalent_bonds:
            ends = []
            for atom in (bond.left, bond.right):
                if atom.entity > len(self.components):
                    raise ValueError("Covalent bond references a missing component.")
                component = self.components[atom.entity - 1]
                length = (
                    len(component.value)
                    if component.kind in {"protein", "rna", "dna"}
                    else max(
                        1, component.value.count("_") if component.value.startswith("CCD_") else 1
                    )
                )
                if (
                    atom.copy_index is not None and atom.copy_index > component.count
                ) or atom.position > length:
                    raise ValueError("Covalent bond copy/position is outside its component.")
                ends.append((atom.entity, atom.copy_index or 0, atom.position, atom.atom))
            key = tuple(sorted(ends))
            if ends[0] == ends[1] or key in seen:
                raise ValueError("Covalent bonds must connect distinct atoms without duplicates.")
            seen.add(key)
        kinds = {component.kind for component in self.components}
        p = self.parameters
        if p.tfg and not {"protein", "ligand"}.issubset(kinds):
            raise ValueError("TFG requires both a protein and a ligand.")
        if p.use_template and "protein" not in kinds and self.operation != "prep":
            raise ValueError("Protein templates require a protein component.")
        if p.use_rna_msa and "rna" not in kinds and self.operation != "prep":
            raise ValueError("RNA MSA requires an RNA component.")
        if p.feature_mode == "uploaded":
            for component in self.components:
                needs_msa = component.kind == "protein" or (
                    component.kind == "rna" and p.use_rna_msa
                )
                has_msa = bool(
                    component.unpaired_msa or component.kind == "protein" and component.paired_msa
                )
                if needs_msa and not has_msa:
                    raise ValueError(
                        "Upload a protein alignment (paired or unpaired), "
                        "or an unpaired RNA alignment."
                    )
                if p.use_template and component.kind == "protein" and not component.template_hits:
                    raise ValueError("Upload template hits for each protein component.")
        return self

    def inference_input(self, job_id: str, assets: dict[str, str] | None = None) -> list[dict]:
        entities = [component.native(assets or {}) for component in self.components]
        document = {"name": job_id, "modelSeeds": self.parameters.seeds, "sequences": entities}
        if self.covalent_bonds:
            document["covalent_bonds"] = [bond.native() for bond in self.covalent_bonds]
        return [document]
