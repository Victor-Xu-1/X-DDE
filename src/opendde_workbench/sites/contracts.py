"""Immutable site associations distinguish hypotheses from biochemical conclusions."""

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from ..receptors.selection import ResidueAddress
from ..scientific_objects import MoleculeRef, ResidueRef, ScientificModel


class SiteOptions(ScientificModel):
    maximum_center_distance: float = Field(default=8, ge=0.1, le=30, allow_inf_nan=False)
    minimum_jaccard: float = Field(default=0.25, ge=0.01, le=1, allow_inf_nan=False)
    minimum_mapping_coverage: float = Field(default=0.7, ge=0.1, le=1, allow_inf_nan=False)
    minimum_shared_residues: int = Field(default=2, ge=1, le=100)


class SiteInput(ScientificModel):
    name: str = Field(
        default="Cross-conformation sites", min_length=1, max_length=120, pattern=r"^[^\x00-\x1f]+$"
    )
    ensemble_id: UUID
    pocket_jobs: tuple[UUID, ...] = Field(min_length=2, max_length=16)
    options: SiteOptions = Field(default_factory=SiteOptions)

    @model_validator(mode="after")
    def distinct_jobs(self):
        if not self.name.strip() or len(set(self.pocket_jobs)) != len(self.pocket_jobs):
            raise ValueError("Name must be visible and pocket jobs must be distinct.")
        return self


class NativeSite(ScientificModel):
    rank: int = Field(ge=1, le=100000)
    name: str = Field(min_length=1, max_length=200)
    score: float = Field(ge=0, allow_inf_nan=False)
    probability: float = Field(ge=0, le=1, allow_inf_nan=False)
    center_x: float = Field(allow_inf_nan=False)
    center_y: float = Field(allow_inf_nan=False)
    center_z: float = Field(allow_inf_nan=False)
    residues: tuple[ResidueRef, ...] = Field(max_length=5000)

    @model_validator(mode="after")
    def unique_residues(self):
        if len(set(self.residues)) != len(self.residues):
            raise ValueError("Pocket residue identities must be unique.")
        return self


class SiteObservation(ScientificModel):
    member_index: int = Field(ge=0, le=15)
    protein: MoleculeRef
    source_job: UUID
    report_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    native_predictions_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    native_residues_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    profile: Literal["experimental", "predicted"]
    method: Literal["P2Rank"]
    software_version: str = Field(min_length=1, max_length=40)
    protein_artifact: str = Field(pattern=r"^protein\.(pdb|cif)$")
    point_threshold: float = Field(ge=0, le=1, allow_inf_nan=False)
    minimum_cluster: int = Field(ge=1, le=100)
    native_pocket_count: int = Field(ge=0, le=100000)
    truncated: bool
    pockets: tuple[NativeSite, ...] = Field(max_length=100)


class SiteEvidence(ScientificModel):
    id: str = Field(pattern=r"^m[0-9]{2}-p[0-9]{1,6}$")
    member_index: int = Field(ge=0, le=15)
    native: NativeSite
    mapped_residues: tuple[ResidueAddress, ...] = Field(max_length=5000)
    mapping_coverage: float = Field(ge=0, le=1, allow_inf_nan=False)
    mapping_status: Literal["sufficient", "insufficient"]
    center: tuple[float, float, float]


class SiteRelation(ScientificModel):
    left: str
    right: str
    center_distance: float = Field(ge=0, allow_inf_nan=False)
    shared_residues: int = Field(ge=0, le=5000)
    residue_jaccard: float = Field(ge=0, le=1, allow_inf_nan=False)
    status: Literal["associated", "not_associated", "uncertain"]
    reasons: tuple[
        Literal[
            "insufficient_mapping",
            "different_prediction_settings",
            "center_distance",
            "residue_overlap",
            "shared_residue_count",
        ],
        ...,
    ]


class SiteGroup(ScientificModel):
    id: str
    sites: tuple[str, ...] = Field(min_length=1, max_length=256)
    status: Literal["associated", "ambiguous", "unmatched", "uncertain"]
    missing_observed_members: tuple[int, ...] = Field(max_length=16)


class BindingSiteSet(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    request: SiteInput
    reference: MoleculeRef
    alignment_job: UUID
    observations: tuple[SiteObservation, ...] = Field(min_length=2, max_length=16)
    sites: tuple[SiteEvidence, ...] = Field(max_length=256)
    relations: tuple[SiteRelation, ...] = Field(max_length=32640)
    groups: tuple[SiteGroup, ...] = Field(max_length=256)
    coordinate_frame: Literal["selected_reference_structure"] = "selected_reference_structure"
    method: Literal["mapped_ca_residue_jaccard_and_aligned_center_distance_v1"] = (
        "mapped_ca_residue_jaccard_and_aligned_center_distance_v1"
    )
    scientific_scope: Literal["predicted_site_association_not_binding_or_cryptic_pocket_proof"] = (
        "predicted_site_association_not_binding_or_cryptic_pocket_proof"
    )
    surface_volume: Literal["not_computed"] = "not_computed"
    accessibility: Literal["not_computed"] = "not_computed"
    created_at: str
