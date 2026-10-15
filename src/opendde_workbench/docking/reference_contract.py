"""Reference-comparison metadata is independent of native score or pose validity."""

from typing import Literal, Self

from pydantic import Field, model_validator

from ..scientific_objects import MoleculeRef, ScientificModel


class ReferenceRmsd(ScientificModel):
    all_heavy: float = Field(ge=0, allow_inf_nan=False)
    contact: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class ReferenceComparison(ScientificModel):
    reference: MoleculeRef
    role: Literal["search_reference", "input_pose"]
    status: Literal["ready", "different_chemical_state", "symmetry_limit"]
    method: Literal["symmetry_aware_heavy_atom_no_fit"]
    unit: Literal["angstrom"]
    heavy_atom_count: int = Field(strict=True, ge=1, le=256)
    contact_atom_count: int | None = Field(default=None, strict=True, ge=0, le=256)
    contact_cutoff_angstrom: Literal[4.0] = 4.0
    symmetry_mappings: int | None = Field(default=None, strict=True, ge=1, le=4096)

    @model_validator(mode="after")
    def counts(self) -> Self:
        if self.status == "ready":
            if self.contact_atom_count is None or self.symmetry_mappings is None:
                raise ValueError("A comparable reference needs native contact and symmetry counts.")
            if self.contact_atom_count > self.heavy_atom_count:
                raise ValueError("Reference contacts must be a subset of its heavy atoms.")
        elif self.contact_atom_count is not None or self.symmetry_mappings is not None:
            raise ValueError("Unavailable comparisons cannot advertise measured atom counts.")
        return self
