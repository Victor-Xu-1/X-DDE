"""Exact qualified poses and the already aligned receptor frame, never ligand fitting."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from ..pose_ensembles.score_contracts import PoseSelector
from ..receptors.selection import ResiduePair
from ..scientific_objects import MoleculeRef, ScientificModel
from ..task_metadata import TaskMetadata
from .cluster_options import ClusterOptions

DIGEST = r"^[a-f0-9]{64}$"


class ClusterReceptor(ScientificModel):
    member_index: int = Field(strict=True, ge=0, le=15)
    reference: MoleculeRef
    residue_pairs: tuple[ResiduePair, ...] = Field(min_length=3, max_length=5000)
    expected_alignment_rmsd_angstrom: float = Field(ge=0, le=30, allow_inf_nan=False)

    @model_validator(mode="after")
    def exact_frame(self):
        if not self.reference.version_id or self.reference.record or self.reference.conformer:
            raise ValueError("Clustering requires an exact saved, single aligned receptor.")
        if len({r.reference for r in self.residue_pairs}) != len(self.residue_pairs) or len(
            {r.moving for r in self.residue_pairs}
        ) != len(self.residue_pairs):
            raise ValueError("Receptor residue correspondence must be one-to-one.")
        return self


class ClusterPose(ScientificModel):
    selection: PoseSelector
    reference: MoleculeRef
    member_index: int = Field(strict=True, ge=0, le=15)

    @model_validator(mode="after")
    def exact_pose(self):
        if not self.reference.version_id or self.reference.record or self.reference.conformer:
            raise ValueError("Use one exact saved native pose, never a whole molecular library.")
        return self


class PoseClusterTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["pose_cluster"] = "pose_cluster"
    name: str = Field(
        default="Binding mode clustering",
        min_length=1,
        max_length=80,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    project_id: UUID | None = None
    pose_set_id: UUID
    pose_set_sha256: str = Field(pattern=DIGEST)
    site_set_sha256: str = Field(pattern=DIGEST)
    receptor_set_id: UUID
    receptor_set_sha256: str = Field(pattern=DIGEST)
    frame: MoleculeRef
    receptors: tuple[ClusterReceptor, ...] = Field(min_length=1, max_length=16)
    poses: tuple[ClusterPose, ...] = Field(min_length=2, max_length=50)
    options: ClusterOptions = Field(default_factory=ClusterOptions)

    @model_validator(mode="after")
    def source_identity(self):
        if not self.name.strip():
            raise ValueError("Give the analysis a visible name.")
        if self.constraints:
            raise ValueError("Pose clustering observes existing coordinates; it does not optimize.")
        if len({r.member_index for r in self.receptors}) != len(self.receptors):
            raise ValueError("Declare each paired receptor once.")
        if len({p.selection for p in self.poses}) != len(self.poses):
            raise ValueError("Select each native pose only once.")
        if {p.member_index for p in self.poses} != {r.member_index for r in self.receptors}:
            raise ValueError(
                "Every pose requires its exact paired receptor, without unused members."
            )
        if not self.frame.version_id or self.frame.record or self.frame.conformer:
            raise ValueError("An exact saved reference receptor defines the common frame.")
        return self


def references(request):
    return (
        (("receptor", request.frame),)
        + tuple(("receptor", row.reference) for row in request.receptors)
        + tuple(("pose", row.reference) for row in request.poses)
    )
