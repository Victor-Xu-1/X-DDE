"""Typed DiffSBDD tasks enter the existing Store/Worker, never a second queue."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..scientific_objects import AtomRef, MoleculeRef, ResidueRef
from ..task_metadata import TaskMetadata
from .options import DiffOptions


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResiduePocket(InputModel):
    kind: Literal["residues"]
    residues: list[ResidueRef] = Field(min_length=1, max_length=250)


class LigandPocket(InputModel):
    kind: Literal["ligand"]
    ligand: MoleculeRef


class BoundPocket(InputModel):
    kind: Literal["bound_ligand"]
    residue: ResidueRef


Pocket = Annotated[ResiduePocket | LigandPocket | BoundPocket, Field(discriminator="kind")]


class DesignInput(InputModel):
    mode: Literal["generate", "inpaint", "diversify", "optimize"]
    protein: MoleculeRef
    pocket: Pocket
    initial: MoleculeRef | None = None
    options: DiffOptions = Field(default_factory=DiffOptions)
    saved_regions: UUID | None = None
    fixed_atoms: list[AtomRef] = Field(default_factory=list, max_length=80)

    @model_validator(mode="after")
    def identities(self) -> Self:
        if self.saved_regions and self.mode != "inpaint":
            raise ValueError("Saved fixed regions are only supported by inpainting.")
        if self.options.task != self.mode:
            raise ValueError("Design mode and native options.task must agree.")
        if self.mode != "generate" and not self.initial:
            raise ValueError("This design mode requires an aligned 3D starting molecule.")
        if self.mode == "inpaint":
            if any(atom.molecule != self.initial for atom in self.fixed_atoms):
                raise ValueError("Fixed atoms must belong to the exact starting molecule version.")
            if [atom.index for atom in self.fixed_atoms] != self.options.fixed_atoms:
                raise ValueError("Fixed atom references and native indices must agree.")
        elif self.fixed_atoms or self.options.fixed_atoms:
            raise ValueError("Fixed atoms are only supported by inpainting.")
        residues = (
            self.pocket.residues
            if isinstance(self.pocket, ResiduePocket)
            else [self.pocket.residue]
            if isinstance(self.pocket, BoundPocket)
            else []
        )
        for residue in residues:
            if residue.structure != self.protein:
                raise ValueError("Pocket residues must belong to the exact protein asset version.")
            residue.diffsbdd_id()
        if len({r.diffsbdd_id() for r in residues}) != len(residues):
            raise ValueError("Pocket residue identities must be unique.")
        return self


class PocketInput(DesignInput):
    mode: Literal["pocket"]

    # Pocket inspection uses the same scientific inputs, without requiring fixed selections.
    @model_validator(mode="after")
    def identities(self) -> Self:
        residues = (
            self.pocket.residues
            if isinstance(self.pocket, ResiduePocket)
            else [self.pocket.residue]
            if isinstance(self.pocket, BoundPocket)
            else []
        )
        for residue in residues:
            if residue.structure != self.protein:
                raise ValueError("Pocket and protein asset versions must agree.")
            residue.diffsbdd_id()
        return self


class PrepareInput(InputModel):
    mode: Literal["prepare"]
    protein: MoleculeRef
    chains: list[str] = Field(default_factory=list, max_length=100)
    remove_water: bool = True
    keep_ligands: bool = True
    remove_hydrogens: bool = False


class EditInput(InputModel):
    mode: Literal["edit"]
    original: MoleculeRef
    molblock: str = Field(min_length=20, max_length=100000)
    notes: str = Field(default="", max_length=3000)
    rating: int = Field(default=0, ge=0, le=5)


class InteractionInput(InputModel):
    mode: Literal["interactions"]
    protein: MoleculeRef
    molecule: MoleculeRef


class IdentityInput(InputModel):
    mode: Literal["identity"]
    molecule: MoleculeRef


class MolecularInput(InputModel):
    mode: Literal["properties", "export"]
    molecules: list[MoleculeRef] = Field(min_length=1, max_length=100)


DiffInput = Annotated[
    DesignInput
    | PocketInput
    | PrepareInput
    | EditInput
    | InteractionInput
    | MolecularInput
    | IdentityInput,
    Field(discriminator="mode"),
]


class DiffTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["diffsbdd"] = "diffsbdd"
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f]+$")
    project_id: UUID | None = None
    payload: DiffInput


def references(request: DiffTask) -> list[tuple[str, MoleculeRef]]:
    payload = request.payload
    result = []
    for field in ("protein", "initial", "original", "molecule"):
        value = getattr(payload, field, None)
        if value is not None:
            result.append((field, value))
    pocket = getattr(payload, "pocket", None)
    if isinstance(pocket, LigandPocket):
        result.append(("reference", pocket.ligand))
    result.extend(("molecule", ref) for ref in getattr(payload, "molecules", []))
    return result
