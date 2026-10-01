"""Typed rigid-alignment evidence before task success, display and asset registration."""

import hashlib
import math
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import ScientificModel
from .contract import ReceptorInput
from .selection import EnsembleOptions, ResiduePair


class ChainEvidence(ScientificModel):
    chain: str = Field(min_length=1, max_length=8)
    observed_ca_count: int = Field(ge=1, le=2000)
    sequence: str = Field(min_length=1, max_length=2000)


class MissingBackbone(ScientificModel):
    chain: str = Field(min_length=1, max_length=8)
    number: int
    insertion_code: str = Field(max_length=1)
    missing: tuple[Literal["N", "C", "O"], ...] = Field(min_length=1, max_length=3)


class StructuralQuality(ScientificModel):
    source_format: Literal["pdb", "mmcif"]
    source_model_count: int = Field(ge=1, le=100)
    selected_model_index: int = Field(ge=0, le=99)
    selected_chains: tuple[str, ...] = Field(min_length=1, max_length=16)
    parser_warnings: tuple[str, ...] = Field(max_length=20)
    parser_warnings_truncated: bool
    atom_count: int = Field(ge=3, le=100000)
    observed_residue_count: int = Field(ge=1, le=100000)
    protein_chains: tuple[ChainEvidence, ...] = Field(min_length=1, max_length=16)
    incomplete_backbone: tuple[MissingBackbone, ...] = Field(max_length=5000)
    backbone_complete: bool
    sidechain_completeness: Literal["not_checked"]
    unobserved_residues: Literal["not_inferred"]
    bfactor_mean: float | None = Field(allow_inf_nan=False)
    bfactor_interpretation: Literal["raw_bfactor_not_automatic_plddt"]
    occupancy_minimum: float | None = Field(ge=0, le=1, allow_inf_nan=False)
    biological_assembly: Literal["provided_coordinates_only"]
    source_profile: Literal["unspecified", "experimental", "predicted"]

    @model_validator(mode="after")
    def consistency(self):
        if self.selected_model_index >= self.source_model_count or self.backbone_complete != (
            not self.incomplete_backbone
        ):
            raise ValueError(
                "Structural quality differs from its observed model/backbone evidence."
            )
        if len(set(self.selected_chains)) != len(self.selected_chains) or any(
            len(c.sequence) != c.observed_ca_count for c in self.protein_chains
        ):
            raise ValueError("Structural chain identity/sequence evidence is inconsistent.")
        if not {c.chain for c in self.protein_chains} <= set(self.selected_chains):
            raise ValueError("C-alpha chains differ from the selected structural model.")
        return self


class Correspondence(ScientificModel):
    method: Literal[
        "reference_coordinates",
        "explicit_ca_residue_anchors",
        "unique_observed_ca_sequence_alignment",
    ]
    pair_count: int = Field(ge=3, le=5000)
    identity: float = Field(ge=0, le=1, allow_inf_nan=False)
    coverage: float = Field(ge=0, le=1, allow_inf_nan=False)


class Transformation(ScientificModel):
    rotation: tuple[tuple[float, ...], ...] = Field(min_length=3, max_length=3)
    translation: tuple[float, ...] = Field(min_length=3, max_length=3)
    convention: Literal["row_xyz_times_rotation_plus_translation"]
    rmsd_angstrom: float = Field(ge=0, allow_inf_nan=False)
    residue_pairs: tuple[ResiduePair, ...] = Field(min_length=3, max_length=5000)

    @model_validator(mode="after")
    def proper_rotation(self):
        matrix = self.rotation
        if (
            any(len(row) != 3 for row in matrix)
            or not all(math.isfinite(v) for row in matrix for v in row)
            or not all(math.isfinite(v) for v in self.translation)
        ):
            raise ValueError(
                "Alignment transform is not a finite three-dimensional rigid transform."
            )
        for i in range(3):
            for j in range(3):
                if (
                    abs(sum(matrix[k][i] * matrix[k][j] for k in range(3)) - (1 if i == j else 0))
                    > 1e-5
                ):
                    raise ValueError("Alignment rotation is not orthogonal.")
        determinant = (
            matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
            - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
            + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
        )
        if abs(determinant - 1) > 1e-5:
            raise ValueError("Alignment must use a proper rotation, not reflection or scaling.")
        if len({p.reference for p in self.residue_pairs}) != len(self.residue_pairs) or len(
            {p.moving for p in self.residue_pairs}
        ) != len(self.residue_pairs):
            raise ValueError("Recorded alignment anchors must be one-to-one.")
        return self


class AlignedMember(ScientificModel):
    index: int = Field(ge=0, le=15)
    source: ReceptorInput
    status: Literal["reference", "aligned", "rejected"]
    artifact: str | None = Field(default=None, pattern=r"^aligned-[0-9]{3}\.(pdb|cif)$")
    artifact_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    correspondence: Correspondence | None = None
    transformation: Transformation | None = None
    quality: StructuralQuality | None = None
    reason: str | None = Field(default=None, max_length=1000)


class ReceptorResult(ScientificModel):
    operation: Literal["receptor_ensemble"]
    complete: Literal[True]
    schema_version: Literal[1]
    inputs: tuple[ReceptorInput, ...] = Field(min_length=2, max_length=16)
    options: EnsembleOptions
    members: tuple[AlignedMember, ...] = Field(min_length=2, max_length=16)
    qualified_count: int = Field(ge=1, le=16)
    collection_status: Literal["aligned", "partial"]
    coordinate_frame: Literal["selected_reference_structure"]
    coordinate_unit: Literal["angstrom"]
    export_rounding_tolerance_angstrom: Literal[0.001]
    versions: dict[str, str]
    method_scope: Literal["observed_ca_rigid_superposition_not_conformation_sampling"]
    biological_assembly: Literal["provided_coordinates_only"]
    chemical_validation: Literal["not_full_atom_parameterization"]

    @model_validator(mode="after")
    def consistency(self):
        if len(self.members) != len(self.inputs) or [m.index for m in self.members] != list(
            range(len(self.inputs))
        ):
            raise ValueError("Receptor report does not cover every declared input exactly once.")
        if (
            self.options.reference_index >= len(self.inputs)
            or self.members[self.options.reference_index].status != "reference"
        ):
            raise ValueError("Receptor reference frame differs from its selected input.")
        for row in self.members:
            if (row.status == "reference") != (row.index == self.options.reference_index):
                raise ValueError("Only the selected reference member defines the ensemble frame.")
            if row.source != self.inputs[row.index]:
                raise ValueError("Receptor member differs from the immutable selection snapshot.")
            if row.status == "rejected":
                if not row.reason or any(
                    v is not None
                    for v in (
                        row.artifact,
                        row.artifact_sha256,
                        row.transformation,
                        row.correspondence,
                    )
                ):
                    raise ValueError(
                        "Rejected receptor members must not advertise "
                        "qualified transformations/artifacts."
                    )
                continue
            if row.reason or any(
                v is None
                for v in (
                    row.artifact,
                    row.artifact_sha256,
                    row.transformation,
                    row.correspondence,
                    row.quality,
                )
            ):
                raise ValueError(
                    "Qualified receptor members require actual alignment/quality/file evidence."
                )
            transform, match, quality = row.transformation, row.correspondence, row.quality
            if (match.method == "reference_coordinates") != (row.status == "reference"):
                raise ValueError("Alignment correspondence method differs from the frame role.")
            if (
                len(transform.residue_pairs) != match.pair_count
                or match.pair_count < self.options.minimum_pairs
                or match.identity < self.options.minimum_identity
                or match.coverage < self.options.minimum_coverage
                or transform.rmsd_angstrom > self.options.maximum_rmsd_angstrom
            ):
                raise ValueError(
                    "Receptor alignment violates its declared correspondence/geometry thresholds."
                )
            if self.options.require_complete_backbone and not quality.backbone_complete:
                raise ValueError("Qualified receptor is missing required backbone atoms.")
            if (
                quality.selected_model_index != row.source.selection.model_index
                or quality.source_profile != row.source.selection.profile
            ):
                raise ValueError("Receptor quality evidence differs from the source model/profile.")
            if row.source.selection.chains and set(quality.selected_chains) != set(
                row.source.selection.chains
            ):
                raise ValueError("Aligned artifact differs from the selected source chains.")
        qualified = sum(m.status != "rejected" for m in self.members)
        if qualified != self.qualified_count or (self.collection_status == "aligned") != (
            qualified == len(self.inputs)
        ):
            raise ValueError("Receptor collection status/count is inconsistent.")
        if self.versions != {"biopython": "1.86", "numpy": "1.26.4"}:
            raise ValueError("Receptor report differs from the reviewed native library versions.")
        return self


def validate_result(value, request, output: Path):
    result = ReceptorResult.model_validate(value)
    if result.inputs != request.inputs or result.options != request.options:
        raise ValueError("Receptor result differs from its exact input/options snapshot.")
    for row in result.members:
        if row.artifact is None:
            continue
        if row.artifact not in {f"aligned-{row.index:03d}.pdb", f"aligned-{row.index:03d}.cif"}:
            raise ValueError("Receptor artifact identity differs from its member record.")
        file = contained(output, row.artifact)
        if (
            not 0 < file.stat().st_size <= 25 * 1024**2
            or hashlib.sha256(file.read_bytes()).hexdigest() != row.artifact_sha256
        ):
            raise ValueError("Aligned receptor bytes changed after native verification.")
    return result
