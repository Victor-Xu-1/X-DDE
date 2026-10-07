"""Validate complete clustering evidence before success, downloads or display."""

import hashlib
from itertools import combinations
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from ..artifacts import contained
from ..pose_ensembles.score_contracts import PoseSelector
from ..receptors.selection import ResidueAddress
from ..scientific_objects import MoleculeRef, ScientificModel
from .cluster_groups import cluster_groups
from .cluster_options import ClusterOptions


class Contact(ScientificModel):
    residue: ResidueAddress
    reference_residue: ResidueAddress | None
    distance_angstrom: float = Field(ge=0, le=6, allow_inf_nan=False)


class ClusterRow(ScientificModel):
    index: int = Field(strict=True, ge=0, lt=50)
    selection: PoseSelector
    reference: MoleculeRef
    member_index: int = Field(strict=True, ge=0, le=15)
    receptor: MoleculeRef
    identity_smiles: str = Field(min_length=1, max_length=20000)
    heavy_atom_count: int = Field(strict=True, ge=2, le=500)
    contact_count: int = Field(strict=True, ge=0, le=50000)
    mapped_contact_count: int = Field(strict=True, ge=0, le=5000)
    contact_mapping_coverage: float | None = Field(ge=0, le=1, allow_inf_nan=False)
    contacts: tuple[Contact, ...] = Field(max_length=50)
    contacts_truncated: bool
    pose_artifact: str = Field(pattern=r"^pose-[0-9]{3}\.sdf$")
    receptor_artifact: str = Field(pattern=r"^receptor-[0-9]{2}\.pdb$")

    @model_validator(mode="after")
    def contacts_match(self):
        if self.mapped_contact_count > self.contact_count:
            raise ValueError("Mapped contacts cannot exceed observed geometric contacts.")
        expected = (self.mapped_contact_count / self.contact_count) if self.contact_count else None
        if self.contact_mapping_coverage != expected:
            raise ValueError("Contact mapping coverage differs from actual observed counts.")
        if len(self.contacts) != min(50, self.contact_count) or (
            self.contacts_truncated != (self.contact_count > 50)
        ):
            raise ValueError("Every displayed/truncated contact must have explicit count evidence.")
        if len({row.residue for row in self.contacts}) != len(self.contacts):
            raise ValueError("Each nearby residue appears once.")
        return self


class Pair(ScientificModel):
    left: int = Field(strict=True, ge=0, lt=50)
    right: int = Field(strict=True, ge=0, lt=50)
    same_chemical_graph: bool
    rmsd_angstrom: float | None = Field(ge=0, allow_inf_nan=False)
    atom_mapping_status: Literal[
        "different_chemical_graph",
        "symmetry_map_budget_exhausted",
        "atom_mapping_unavailable",
        "complete_stereo_preserving_symmetry",
    ]
    symmetry_maps: int = Field(strict=True, ge=0, le=1001)
    contact_jaccard: float | None = Field(ge=0, le=1, allow_inf_nan=False)
    contact_status: Literal[
        "no_mapped_contacts", "insufficient_residue_mapping", "mapped_geometric_residue_contacts"
    ]

    @model_validator(mode="after")
    def unknown_is_not_zero(self):
        if self.left >= self.right:
            raise ValueError("Each pair must appear in canonical index order.")
        known = self.atom_mapping_status == "complete_stereo_preserving_symmetry"
        if known != (self.rmsd_angstrom is not None) or known and not self.symmetry_maps:
            raise ValueError("A numeric RMSD requires complete stereochemical atom mapping.")
        if (self.contact_status == "mapped_geometric_residue_contacts") != (
            self.contact_jaccard is not None
        ):
            raise ValueError("Missing contact evidence remains unknown, never a perfect match.")
        if (not self.same_chemical_graph) != (
            self.atom_mapping_status == "different_chemical_graph"
        ):
            raise ValueError("Different chemical graphs cannot share a symmetry RMSD.")
        return self


class Cluster(ScientificModel):
    id: int = Field(strict=True, ge=1, le=50)
    members: tuple[int, ...] = Field(min_length=1, max_length=50)
    representative: int = Field(strict=True, ge=0, lt=50)
    sample_count: int = Field(strict=True, ge=1, le=50)


class FrameCheck(ScientificModel):
    member_index: int = Field(strict=True, ge=0, le=15)
    observed_rmsd_angstrom: float = Field(ge=0, allow_inf_nan=False)


class PoseClusterResult(ScientificModel):
    operation: Literal["pose_cluster"]
    schema_version: Literal[1]
    complete: Literal[True]
    pose_set_id: UUID
    pose_set_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    site_set_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    receptor_set_id: UUID
    receptor_set_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    frame: MoleculeRef
    options: ClusterOptions
    rows: tuple[ClusterRow, ...] = Field(min_length=2, max_length=50)
    pairs: tuple[Pair, ...] = Field(min_length=1, max_length=1225)
    clusters: tuple[Cluster, ...] = Field(min_length=1, max_length=50)
    frame_checks: tuple[FrameCheck, ...] = Field(min_length=1, max_length=16)
    artifacts: dict[str, str] = Field(min_length=6, max_length=70)
    method: Literal["fixed_receptor_frame_symmetry_rmsd_mapped_contacts_complete_link_v1"]
    coordinate_unit: Literal["angstrom"]
    ligand_superposition: Literal[False]
    contact_scope: Literal["provided_ATOM_heavy_protein_geometric_contacts"]
    cluster_count_interpretation: Literal["sample_counts_not_mode_probability_or_affinity"]
    representative_method: Literal["original_source_medoid"]
    versions: dict[str, str]

    @model_validator(mode="after")
    def complete_evidence(self):
        count = len(self.rows)
        if [row.index for row in self.rows] != list(range(count)):
            raise ValueError("Clustering must retain every source pose in its exact input order.")
        expected = set(combinations(range(count), 2))
        if len(self.pairs) != len(expected) or {(p.left, p.right) for p in self.pairs} != expected:
            raise ValueError("Clustering must retain every requested pair, including unknowns.")
        for pair in self.pairs:
            if pair.same_chemical_graph != (
                self.rows[pair.left].identity_smiles == self.rows[pair.right].identity_smiles
            ):
                raise ValueError("Pair graph identity differs from the actual pose records.")
        computed = cluster_groups(
            [r.model_dump(mode="json") for r in self.rows],
            [p.model_dump(mode="json") for p in self.pairs],
            self.options,
        )
        if computed != [c.model_dump(mode="json") for c in self.clusters]:
            raise ValueError(
                "Clusters or source medoids differ from the declared complete-link method."
            )
        return self


def validate_cluster(value, request, output: Path):
    result = PoseClusterResult.model_validate(value)
    for key in (
        "pose_set_id",
        "pose_set_sha256",
        "site_set_sha256",
        "receptor_set_id",
        "receptor_set_sha256",
    ):
        if str(getattr(result, key)) != str(getattr(request, key)):
            raise ValueError("Clustering result differs from its frozen source collections.")
    if result.frame != request.frame or result.options != request.options:
        raise ValueError("Clustering result frame/options differ from its exact request.")
    if len(result.rows) != len(request.poses):
        raise ValueError("Clustering lost requested source poses.")
    receptors = {row.member_index: row for row in request.receptors}
    required = {"clusters.csv", "pairs.csv", "contacts.csv", "frame.pdb"}
    for row, source in zip(result.rows, request.poses, strict=True):
        if (
            row.selection != source.selection
            or row.reference != source.reference
            or row.member_index != source.member_index
            or row.receptor != receptors[source.member_index].reference
            or row.pose_artifact != f"pose-{row.index:03d}.sdf"
            or row.receptor_artifact != f"receptor-{row.member_index:02d}.pdb"
        ):
            raise ValueError("Clustering row is not the exact native pose and paired receptor.")
        required.update((row.pose_artifact, row.receptor_artifact))
        if result.artifacts.get(row.pose_artifact) != row.reference.sha256 or (
            result.artifacts.get(row.receptor_artifact) != row.receptor.sha256
        ):
            raise ValueError("Preview copies must retain original native source bytes.")
        if any(
            contact.distance_angstrom > request.options.contact_cutoff_angstrom
            for contact in row.contacts
        ):
            raise ValueError("A reported geometric contact exceeds its requested cutoff.")
    checks = {row.member_index: row.observed_rmsd_angstrom for row in result.frame_checks}
    if len(checks) != len(result.frame_checks) or set(checks) != set(receptors):
        raise ValueError("Every paired receptor needs an observed reference-frame check.")
    for index, receptor in receptors.items():
        if abs(checks[index] - receptor.expected_alignment_rmsd_angstrom) > 0.01:
            raise ValueError("Receptor frame check differs from its saved alignment.")
    if (
        set(result.artifacts) != required
        or result.artifacts.get("frame.pdb") != request.frame.sha256
    ):
        raise ValueError("Clustering artifacts differ from the complete requested diagnostics.")
    total = 0
    for name, digest in result.artifacts.items():
        file = contained(output, name)
        total += file.stat().st_size
        if total > 256 * 1024**2 or not 0 < file.stat().st_size <= 25 * 1024**2:
            raise ValueError("Clustering diagnostic artifacts exceed the bounded output budget.")
        if hashlib.sha256(file.read_bytes()).hexdigest() != digest:
            raise ValueError("Clustering diagnostic artifact changed after native execution.")
    if set(result.versions) != {"rdkit", "numpy"}:
        raise ValueError("Clustering requires explicit native chemical/numeric versions.")
    return result
