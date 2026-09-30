"""Typed normalized results; terminal success requires provenance and per-pose invariants."""

from typing import Literal, Self

from pydantic import Field, model_validator

from ..research.constraint_contract import ConstraintReference
from ..scientific_objects import MoleculeRef, ScientificModel
from .contract import Search
from .manifest import BINARY_SHA256, VERSION
from .options import DockingOptions
from .quality import BoundsCheck


class Score(ScientificModel):
    name: Literal["minimizedAffinity", "CNNscore", "CNNaffinity"]
    value: float = Field(allow_inf_nan=False)
    unit: Literal["kcal/mol", "model_output"]
    direction: Literal["lower", "higher"]

    @model_validator(mode="after")
    def units(self) -> Self:
        empirical = self.name == "minimizedAffinity"
        if self.unit != ("kcal/mol" if empirical else "model_output") or self.direction != (
            "lower" if empirical else "higher"
        ):
            raise ValueError("Score units/direction do not match the declared native method.")
        return self


class Pose(ScientificModel):
    record: int = Field(ge=0, lt=100, strict=True)
    valid: bool = Field(strict=True)
    scores: tuple[Score, ...] = Field(max_length=3)
    mapping_status: Literal[
        "unavailable", "native_atom_maps", "unique_graph_match", "ambiguous_reconfirm_selections"
    ]
    source_to_pose_atoms: tuple[int, ...] | None = Field(default=None, max_length=256)
    smiles: str | None = Field(default=None, max_length=20000)
    reason: str | None = Field(default=None, max_length=1000)
    artifact: str | None = None
    diagnostic_artifact: str | None = None
    qualified_record: int | None = Field(default=None, strict=True, ge=0, lt=100)
    constraint_checks: tuple[BoundsCheck, ...] = Field(default=(), max_length=32)

    @model_validator(mode="after")
    def candidate(self) -> Self:
        if self.diagnostic_artifact is not None and (
            self.diagnostic_artifact != f"diagnostic-pose-{self.record + 1:03d}.sdf"
            or self.valid
            or not any(c.strength == "hard" and not c.passed for c in self.constraint_checks)
        ):
            raise ValueError("Diagnostic normalized poses require an actual failed hard check.")
        if len({c.condition_id for c in self.constraint_checks}) != len(self.constraint_checks):
            raise ValueError("Output condition checks must be unique per pose.")
        if self.valid and any(
            c.strength == "hard" and not c.passed for c in self.constraint_checks
        ):
            raise ValueError("A failed hard output condition cannot be a reusable candidate.")
        if not self.valid and self.qualified_record is not None:
            raise ValueError("Rejected poses cannot have a qualified bundle record.")
        if len({v.name for v in self.scores}) != len(self.scores):
            raise ValueError("Duplicate native scores are not a complete pose result.")
        if self.valid:
            if (
                self.artifact != f"pose-{self.record + 1:03d}.sdf"
                or not self.smiles
                or not any(v.name == "minimizedAffinity" for v in self.scores)
            ):
                raise ValueError(
                    "Valid pose needs its exact artifact, chemical identity and empirical score."
                )
            if self.mapping_status == "unavailable":
                raise ValueError("Valid pose lacks mapping outcome.")
        elif not self.reason or self.artifact is not None:
            raise ValueError(
                "Invalid poses need a reason and cannot advertise a reusable artifact."
            )
        if self.mapping_status in {"native_atom_maps", "unique_graph_match"}:
            indices = self.source_to_pose_atoms
            if not indices or sorted(indices) != list(range(len(indices))):
                raise ValueError("Native atom mapping must be a bijection over heavy-atom indices.")
        elif self.source_to_pose_atoms is not None:
            raise ValueError("Ambiguous/unavailable mappings cannot claim atom identity.")
        return self


class DockingResult(ScientificModel):
    operation: Literal["docking"]
    complete: Literal[True]
    mode: Literal["dock", "score", "minimize"]
    method: Literal["GNINA"]
    software_version: str
    binary_sha256: str
    parser: str = Field(pattern=r"^RDKit [0-9]+[.][0-9]+[.][0-9]+.*$", max_length=80)
    receptor: MoleculeRef
    ligand: MoleculeRef
    frame: MoleculeRef
    options: DockingOptions
    search: Search | None
    initial_conformer_generated: bool
    poses: tuple[Pose, ...] = Field(max_length=100)
    pose_artifact: Literal["poses.sdf", "qualified-poses.sdf"]
    raw_pose_artifact: Literal["poses.sdf"] | None = None
    constraint_reference: ConstraintReference | None = None
    receptor_artifact: Literal["receptor.pdb"]
    scientific_outcome: Literal["candidates", "no_valid_pose"]
    scientific_acceptance: Literal["pending_server_validation"]
    coordinate_provenance: Literal["user_confirmed", "receptor_anchored_box"]
    notes: str = Field(max_length=2000)

    @model_validator(mode="after")
    def provenance(self) -> Self:
        if (
            self.software_version != VERSION
            or self.binary_sha256 != BINARY_SHA256
            or self.frame != self.receptor
        ):
            raise ValueError("Native result has incompatible program or receptor provenance.")
        if [p.record for p in self.poses] != list(range(len(self.poses))):
            raise ValueError("Pose records must preserve native output order without duplicates.")
        if self.mode != "dock" and len(self.poses) != 1:
            raise ValueError("Existing-pose operations must retain exactly one pose.")
        if len(self.poses) > (self.options.num_modes if self.mode == "dock" else 1):
            raise ValueError("Pose count exceeds the declared execution budget.")
        if (self.scientific_outcome == "candidates") != any(p.valid for p in self.poses):
            raise ValueError("Scientific outcome differs from actual pose validation.")
        if self.raw_pose_artifact is not None:
            if self.pose_artifact != "qualified-poses.sdf":
                raise ValueError("New results must separate raw native and qualified bundles.")
            if [p.qualified_record for p in self.poses if p.valid] != list(
                range(sum(p.valid for p in self.poses))
            ):
                raise ValueError("Qualified bundle records must retain eligible pose order.")
        if any(p.constraint_checks for p in self.poses) and self.constraint_reference is None:
            raise ValueError("Output checks require the immutable condition reference.")
        if self.options.cnn_scoring == "none" and any(
            s.name.startswith("CNN") for p in self.poses for s in p.scores
        ):
            raise ValueError("Disabled CNN cannot claim neural model outputs.")
        return self
