"""Typed native inputs; no browser paths, commands, downloads or arbitrary configuration."""

import re
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata
from .options import (
    BoltzGenPayload,
    BoltzPayload,
    ChempropPayload,
    ElectrostaticsPayload,
    ExecutionOptions,
    InteractionPayload,
    LigandMPNNPayload,
    RefinementPayload,
    ReinventPayload,
)

OPERATIONS = {
    "boltz_predict": "boltz",
    "reinvent_design": "reinvent",
    "ligandmpnn_design": "ligandmpnn",
    "boltzgen_design": "boltzgen",
    "structure_refine": "openmm",
    "electrostatics": "apbs",
    "chemprop_train": "chemprop",
    "chemprop_predict": "chemprop",
    "interaction_profile": "plip",
}


class MaterialInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["structure", "ligand", "library", "scaffold"]
    source: MoleculeRef


Payload = Annotated[
    BoltzPayload
    | ReinventPayload
    | LigandMPNNPayload
    | BoltzGenPayload
    | RefinementPayload
    | ElectrostaticsPayload
    | ChempropPayload
    | InteractionPayload,
    Field(discriminator="kind"),
]


class IntegratedTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal[
        "boltz_predict",
        "reinvent_design",
        "ligandmpnn_design",
        "boltzgen_design",
        "structure_refine",
        "electrostatics",
        "chemprop_train",
        "chemprop_predict",
        "interaction_profile",
    ]
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$")
    project_id: UUID | None = None
    inputs: list[MaterialInput] = Field(default_factory=list, max_length=2)
    payload: Payload
    options: ExecutionOptions = Field(default_factory=ExecutionOptions)

    @model_validator(mode="after")
    def contract(self) -> Self:
        self.name = self.name.strip()
        if not self.name or self.payload.kind != OPERATIONS[self.operation]:
            raise ValueError("Choose a named task and its matching scientific program.")
        if self.constraints:
            raise ValueError("This native adapter does not execute platform constraint sets.")
        roles = {item.role for item in self.inputs}
        if len(roles) != len(self.inputs):
            raise ValueError("Select each input role exactly once.")
        if self.scientific_inputs != [item.source for item in self.inputs]:
            raise ValueError("Confirm the exact scientific input versions before submission.")
        if any(
            item.source.conformer or (item.role != "ligand" and item.source.record)
            for item in self.inputs
        ):
            raise ValueError(
                "Whole structures/libraries use record zero and the original conformer."
            )
        kind = self.payload.kind
        expected = (
            {"structure"} if kind in {"ligandmpnn", "boltzgen", "openmm", "apbs", "plip"} else set()
        )
        if kind == "openmm":
            if not expected <= roles or not roles <= {"structure", "ligand"}:
                raise ValueError(
                    "Refinement needs a structure and optionally its exact bound ligand."
                )
        elif kind == "boltzgen":
            scaffold = self.payload.modality in {"antibody", "nanobody"}
            if roles != ({"structure", "scaffold"} if scaffold else {"structure"}):
                raise ValueError(
                    "Antibody variable-region design needs an exact framework scaffold."
                )
            if scaffold and not (self.payload.scaffold_chain and self.payload.scaffold_residues):
                raise ValueError("Select the framework chain and the residues to redesign.")
            if any(
                not re.fullmatch(r"[A-Za-z0-9]-?\d+[A-Za-z]?", r)
                for r in self.payload.scaffold_residues
            ):
                raise ValueError("Select exact scaffold residue identities.")
        elif kind == "reinvent":
            expected = {"ligand"} if self.payload.mode in {"analogues", "optimize"} else set()
            if roles != expected:
                raise ValueError(
                    "Choose an exact starting molecule for analogue generation/optimization."
                )
            if self.payload.mode in {"r_groups", "linker"}:
                count = 1 if self.payload.mode == "r_groups" else 2
                if len(self.payload.fragments) != count or any(
                    "*" not in s or len(s) > 2000 or re.search(r"\s", s)
                    for s in self.payload.fragments
                ):
                    raise ValueError(
                        "Choose scaffold/fragments with explicit attachment points (*)."
                    )
            if any(not lo < hi for lo, hi in (self.payload.molecular_weight, self.payload.logp)):
                raise ValueError("Property ranges must have increasing limits.")
        elif kind == "chemprop":
            expected = {"library"}
            if self.payload.mode != self.operation.removeprefix("chemprop_"):
                raise ValueError("Property-model mode differs from the chosen task.")
            if self.payload.mode == "predict" and not (
                self.payload.model_job and self.payload.model_sha256
            ):
                raise ValueError("Choose a complete X-DDE-trained model with its exact checksum.")
            if roles != expected:
                raise ValueError("Choose one whole SDF library for property modeling.")
        elif kind == "boltz":
            sources = [c.source for c in self.payload.components if c.source]
            if (
                len(sources) > 1
                or (sources and (roles != {"ligand"} or self.inputs[0].source != sources[0]))
                or (not sources and roles)
            ):
                raise ValueError("Confirm the selected ligand file once in the exact task inputs.")
            if any(
                (c.source and (c.kind != "ligand" or c.value)) or (not c.source and not c.value)
                for c in self.payload.components
            ):
                raise ValueError(
                    "Choose either a ligand file or text for each molecular component."
                )
        elif roles != expected:
            raise ValueError("The selected input roles differ from this task's requirements.")
        if kind == "boltz":
            components = self.payload.components
            if len({item.id for item in components}) != len(components):
                raise ValueError("Assign each molecular component a unique chain identifier.")
            alphabets = {
                "protein": set("ACDEFGHIKLMNPQRSTVWYX"),
                "rna": set("ACGU"),
                "dna": set("ACGT"),
            }
            if any(
                item.kind in alphabets and not set(item.value) <= alphabets[item.kind]
                for item in components
            ):
                raise ValueError("Sequence letters differ from the chosen molecular type.")
            if self.payload.affinity and (
                sum(item.kind == "ligand" for item in components) != 1
                or not any(c.kind == "protein" for c in components)
            ):
                raise ValueError("Affinity prediction requires exactly one small-molecule ligand.")
        if kind == "ligandmpnn" and any(
            not re.fullmatch(r"[A-Za-z0-9]-?\d+[A-Za-z]?", item)
            for item in self.payload.redesigned_residues
        ):
            raise ValueError(
                "Choose residue identities such as A123, preserving chain and insertion code."
            )
        if kind == "boltzgen":
            low, high = self.payload.length
            if not 8 <= low <= high <= 300 or self.payload.retain > self.payload.candidates:
                raise ValueError(
                    "Choose a bounded design length and retain no more than generated."
                )
            if any(not re.fullmatch(r"[A-Za-z0-9]", chain) for chain in self.payload.target_chains):
                raise ValueError("Choose explicit one-character target chains.")
        if kind in {"boltz", "boltzgen"} and self.options.device != "cuda":
            raise ValueError("Choose the server GPU for this computationally demanding task.")
        if kind in {"openmm", "apbs", "plip", "reinvent"} and self.options.device != "cpu":
            raise ValueError("This reviewed environment executes on CPU.")
        return self
