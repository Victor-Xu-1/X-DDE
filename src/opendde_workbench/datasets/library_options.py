"""Chemical processing choices preserve source records and original chemistry."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LibraryOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["chemistry"] = "chemistry"
    mode: Literal["prepare", "subset"] = "prepare"
    supplier: str = Field(default="custom", pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    library_name: str = Field(default="Research library", min_length=1, max_length=120)
    id_column: str = Field(default="ID", min_length=1, max_length=80)
    smiles_column: str = Field(default="SMILES", min_length=1, max_length=80)
    delimiter: Literal[",", "\t"] = ","
    max_records: int = Field(default=10000000, ge=1, le=100000000)
    expanded_bytes: int = Field(default=50 * 1024**3, ge=1024, le=200 * 1024**3)
    max_heavy_atoms: int = Field(default=256, ge=8, le=2000)
    selected_ids: list[str] = Field(default_factory=list, max_length=500)
    generate_conformers: bool = True
    source_permission: Literal["official_public_resource", "user_owned_file"] = "user_owned_file"
    source_url: str = Field(default="", max_length=1000)
