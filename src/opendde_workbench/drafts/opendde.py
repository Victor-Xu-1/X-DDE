"""OpenDDE form snapshots preserve unfinished UI without running inference."""

import math
from typing import Annotated, Literal

from pydantic import Field, JsonValue, field_validator, model_validator

from .entities import Bond, Entity, Reference, entity_asset_ids
from .snapshot import SnapshotModel, bounded_state

Workflow = Literal["complex", "protein", "protein-complex", "antibody", "nucleic", "ligand"]
Components = Annotated[list[Entity], Field(max_length=32)]
NUMBERS = {"seed", "samples", "steps", "cycles", "search_cpus"}
FLAGS = {
    "distributed",
    "tfg",
    "atom_confidence",
    "enable_cache",
    "enable_fusion",
    "enable_tf32",
    "deterministic",
    "use_template",
    "use_rna_msa",
    "allow_network",
}
ENUMS = {
    "dtype": {"bf16", "fp32"},
    "model": {"standard", "abag"},
    "device": {"cpu", "cuda"},
    "feature_mode": {"none", "uploaded", "search"},
    "triatt_kernel": {"auto", "cuequivariance", "torch"},
    "trimul_kernel": {"auto", "cuequivariance", "torch"},
}


def finite(value):
    return type(value) in {int, float} and math.isfinite(value) and abs(value) <= 1e12


class OpenDdeState(SnapshotModel):
    name: str = Field(max_length=80)
    kind: Workflow
    components: Components
    workflows: dict[Workflow, Components] = Field(max_length=6)
    parameters: dict[str, JsonValue] = Field(max_length=32)
    bonds: list[Bond] = Field(max_length=256)
    expert: bool = Field(strict=True)
    input_references: list[Reference] = Field(max_length=128)
    integer_text: dict[
        Literal["additional_seeds", "gpu_ids"], Annotated[str, Field(max_length=1000)]
    ] = Field(max_length=2)

    @field_validator("parameters")
    @classmethod
    def editor_parameters(cls, value):
        if not {"seed", "samples", "steps", "cycles", "dtype"} <= value.keys():
            raise ValueError("The draft is missing OpenDDE editor settings.")
        for key, item in value.items():
            valid = False
            if key in NUMBERS:
                valid = finite(item)
            elif key in FLAGS:
                valid = type(item) is bool
            elif key in ENUMS:
                valid = isinstance(item, str) and item in ENUMS[key]
            elif key in {"additional_seeds", "gpu_ids"}:
                valid = isinstance(item, list) and len(item) <= 32 and all(map(finite, item))
            elif key == "checkpoint_id":
                valid = item is None or isinstance(item, str) and len(item) <= 1000
            if not valid:
                raise ValueError("Unsupported or unbounded OpenDDE editor setting.")
        return value

    @model_validator(mode="after")
    def bounded_snapshot(self):
        return bounded_state(self, self.parameters)

    def asset_ids(self):
        entities = [*self.components, *(row for rows in self.workflows.values() for row in rows)]
        return entity_asset_ids(entities) | {str(ref.asset_id) for ref in self.input_references}
