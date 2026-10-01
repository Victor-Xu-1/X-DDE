"""Explicit coordinate selection/export; no inferred atoms, alignment or chemistry."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PreparationOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    model_index: int = Field(default=0, ge=0, le=99)
    chains: tuple[str, ...] = Field(default=(), max_length=16)
    format: Literal["pdb", "cif"] = "pdb"
    waters: bool = False
    heterogens: Literal["keep", "remove"] = "keep"
    alternate: str = Field(default="reject", pattern=r"^(reject|[A-Za-z0-9])$")
    cpu: int = Field(default=1, ge=1, le=2)
    memory_mib: int = Field(default=2048, ge=512, le=8192)

    @model_validator(mode="after")
    def unique_chains(self):
        if len(set(self.chains)) != len(self.chains) or any(
            not c or len(c) > 8 or any(ord(x) < 32 or ord(x) == 127 for x in c) for c in self.chains
        ):
            raise ValueError("Choose unique explicit author chain identifiers.")
        return self
