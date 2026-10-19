"""Keep native interface metrics distinct from the user-target-conditioned C-alpha RMSD."""

import math
from typing import Literal

from pydantic import Field, model_validator

from .options import ChainMapping, ComparisonModel


class InterfaceMetrics(ComparisonModel):
    DockQ: float = Field(ge=0, le=1)
    F1: float = Field(ge=0, le=1)
    iRMSD: float = Field(ge=0)
    LRMSD: float = Field(ge=0)
    fnat: float = Field(ge=0, le=1)
    nat_correct: int = Field(strict=True, ge=0, le=4000000)
    nat_total: int = Field(strict=True, ge=1, le=4000000)
    fnonnat: float = Field(ge=0, le=1)
    nonnat_count: int = Field(strict=True, ge=0, le=4000000)
    model_total: int = Field(strict=True, ge=0, le=4000000)
    clashes: int = Field(strict=True, ge=0, le=4000000)
    len1: int = Field(strict=True, ge=3, le=2000)
    len2: int = Field(strict=True, ge=3, le=2000)
    class1: Literal["receptor", "ligand"]
    class2: Literal["receptor", "ligand"]
    is_het: Literal[False]

    @model_validator(mode="after")
    def native_formula(self):
        if self.nat_correct > self.nat_total or (
            self.nat_correct + self.nonnat_count != self.model_total
        ):
            raise ValueError("Native interface contact counts are inconsistent.")
        expected = (
            self.nat_correct / self.nat_total,
            self.nonnat_count / self.model_total if self.model_total else 0,
            2 * self.nat_correct / (self.nat_correct + self.nonnat_count + self.nat_total),
            (self.fnat + 1 / (1 + (self.iRMSD / 1.5) ** 2) + 1 / (1 + (self.LRMSD / 8.5) ** 2)) / 3,
        )
        if any(
            not math.isclose(actual, value, rel_tol=1e-10, abs_tol=1e-10)
            for actual, value in zip(
                (self.fnat, self.fnonnat, self.F1, self.DockQ), expected, strict=True
            )
        ):
            raise ValueError("Native interface scores differ from their contact/RMSD evidence.")
        classes = ("receptor", "ligand") if self.len1 > self.len2 else ("ligand", "receptor")
        if (self.class1, self.class2) != classes:
            raise ValueError("Native backbone LRMSD receptor assignment differs from chain sizes.")
        return self


class IdenticalPair(ComparisonModel):
    reference_number: int = Field(strict=True, ge=-99999, le=999999)
    reference_insertion: str = Field(max_length=1)
    moving_number: int = Field(strict=True, ge=-99999, le=999999)
    moving_insertion: str = Field(max_length=1)


class NativeInventory(ComparisonModel):
    reference_chain: str = Field(min_length=1, max_length=8)
    moving_chain: str = Field(min_length=1, max_length=8)
    matched_identical: tuple[IdenticalPair, ...] = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def unambiguous(self):
        for side in ("reference", "moving"):
            keys = [
                (getattr(p, side + "_number"), getattr(p, side + "_insertion"))
                for p in self.matched_identical
            ]
            if len(set(keys)) != len(keys):
                raise ValueError("Native interface correspondence repeats a residue.")
        return self


class NativeInterface(ComparisonModel):
    target: ChainMapping
    partner: ChainMapping
    state: Literal["evaluated", "no_reference_interface"]
    metrics: InterfaceMetrics | None
    correspondence: tuple[NativeInventory, NativeInventory]
    metric_scope: Literal["native_backbone_and_observed_heavy_atom_reference_interface"]

    @model_validator(mode="after")
    def complete(self):
        if (self.metrics is not None) != (self.state == "evaluated"):
            raise ValueError("Absent reference interfaces must not contain invented scores.")
        for mapping, inventory in zip(
            (self.target, self.partner), self.correspondence, strict=True
        ):
            if (mapping.reference, mapping.moving) != (
                inventory.reference_chain,
                inventory.moving_chain,
            ):
                raise ValueError("Native interface inventory differs from its chain roles.")
        return self


class NativeQuality(ComparisonModel):
    version: Literal["2.1.3"]
    interfaces: tuple[NativeInterface, ...] = Field(min_length=1, max_length=16)
    mapping_method: Literal["explicit_platform_correspondence_native_DockQ_core"]
    mutated_residue_scope: Literal[
        "native_DockQ_identical_residues_only; primary_CA_RMSD_keeps_mutations"
    ]
    quality_grade: None
    interpretation: Literal[
        "reference_conditioned_geometry_not_affinity_or_experimental_validation"
    ]
