"""Typed reference-conditioned comparison output, independent of native runtime imports."""

from typing import Literal

from pydantic import Field, model_validator

from ..receptors.result import StructuralQuality
from ..receptors.selection import ResidueAddress
from ..scientific_objects import MoleculeRef
from .geometry_result import ComparisonGeometry
from .options import ComparisonModel, ComparisonOptions
from .quality_result import NativeQuality


class NamedResidue(ResidueAddress):
    residue: str = Field(min_length=1, max_length=8)


class ModifiedResidue(NamedResidue):
    parent: str = Field(min_length=1, max_length=8)
    annotation_basis: Literal["source_modification_annotation", "source_polymer_membership"]


class PolymerObservation(ComparisonModel):
    polymer_residues: int = Field(strict=True, ge=1, le=5000)
    chain_residue_counts: dict[str, int] = Field(min_length=2, max_length=8)
    modified_residues: tuple[ModifiedResidue, ...] = Field(max_length=5000)
    excluded_nonpolymer_residues: tuple[NamedResidue, ...] = Field(max_length=100000)

    @model_validator(mode="after")
    def source_counts(self):
        if any(not 1 <= count <= 2000 for count in self.chain_residue_counts.values()) or (
            sum(self.chain_residue_counts.values()) != self.polymer_residues
        ):
            raise ValueError("Polymer chain counts differ from the selected observations.")
        identities = [(r.chain, r.number, r.insertion_code) for r in self.modified_residues]
        if len(set(identities)) != len(identities) or any(
            r.chain not in self.chain_residue_counts for r in self.modified_residues
        ):
            raise ValueError("Modified polymer identities are duplicated or outside the selection.")
        return self


class ComparisonInspection(ComparisonModel):
    structure: StructuralQuality
    polymer: PolymerObservation


class ChainCorrespondence(ComparisonModel):
    role: Literal["target", "partner"]
    reference_chain: str = Field(min_length=1, max_length=8)
    moving_chain: str = Field(min_length=1, max_length=8)
    reference_observed: int = Field(strict=True, ge=1, le=2000)
    moving_observed: int = Field(strict=True, ge=1, le=2000)
    matched: int = Field(strict=True, ge=1, le=2000)
    identical: int = Field(strict=True, ge=0, le=2000)
    identity: float = Field(ge=0, le=1)
    reference_coverage: float = Field(ge=0, le=1)
    moving_coverage: float = Field(ge=0, le=1)
    coverage: float = Field(ge=0, le=1)
    unmatched_reference: tuple[ResidueAddress, ...] = Field(max_length=2000)
    unmatched_moving: tuple[ResidueAddress, ...] = Field(max_length=2000)


class ComparisonResult(ComparisonModel):
    operation: Literal["structure_compare"]
    complete: Literal[True]
    schema_version: Literal[1]
    reference: MoleculeRef
    moving: MoleculeRef
    options: ComparisonOptions
    inspections: tuple[ComparisonInspection, ComparisonInspection]
    chain_correspondence: tuple[ChainCorrespondence, ...] = Field(min_length=2, max_length=8)
    geometry: ComparisonGeometry
    native_quality: NativeQuality
    artifact_sha256: dict[str, str]
    coordinate_frame: Literal["selected_reference_source"]
    export_rounding_tolerance_angstrom: Literal[0.001]
    versions: dict[str, str]
    scope: Literal["observed_reference_conditioned_structural_comparison_not_affinity"]
    unobserved_coordinates: Literal["not_generated"]

    @model_validator(mode="after")
    def consistent_evidence(self):
        from .result_evidence import verify_evidence

        verify_evidence(self)
        return self
