"""Bounded paired hypotheses preserve site, chemical state and initialization identities."""

from typing import Annotated
from uuid import UUID

from pydantic import Field, model_validator

from ..docking.options import DockingOptions, Length
from ..scientific_objects import MoleculeRef, ScientificModel


class ExplorationLigand(ScientificModel):
    reference: MoleculeRef
    state_set_id: UUID | None = None
    state_index: int | None = Field(default=None, strict=True, ge=0, le=63)
    conformer_index: int | None = Field(default=None, strict=True, ge=0, le=15)

    @model_validator(mode="after")
    def explicit_state(self):
        if self.reference.version_id is None:
            raise ValueError("Pose exploration requires an immutable saved ligand version.")
        if self.reference.conformer:
            raise ValueError("GNINA exploration requires an explicit SDF record with conformer 0.")
        if (self.state_set_id is None) != (self.state_index is None):
            raise ValueError("Chemical state provenance needs both its collection and member.")
        if self.conformer_index is not None and self.state_set_id is None:
            raise ValueError("Conformer identity requires its chemical-state collection.")
        return self


class ExplorationOptions(ScientificModel):
    docking: DockingOptions = Field(default_factory=DockingOptions)
    seed_count: int = Field(default=1, strict=True, ge=1, le=3)
    box_size: tuple[Length, Length, Length] = (20.0, 20.0, 20.0)
    max_jobs: int = Field(default=12, strict=True, ge=1, le=30)
    wall_seconds: int = Field(default=14400, strict=True, ge=60, le=86400)

    @model_validator(mode="after")
    def seed_budget(self):
        if self.docking.seed + self.seed_count - 1 > 2147483647:
            raise ValueError("Starting seed and initialization count exceed the native seed range.")
        return self


class ExplorationInput(ScientificModel):
    name: str = Field(
        default="Multi-hypothesis pose exploration",
        min_length=1,
        max_length=120,
        pattern=r"^[^\x00-\x1f]+$",
    )
    site_set_id: UUID
    site_ids: tuple[Annotated[str, Field(pattern=r"^m[0-9]{2}-p[0-9]{1,6}$")], ...] = Field(
        min_length=1, max_length=12
    )
    ligands: tuple[ExplorationLigand, ...] = Field(min_length=1, max_length=12)
    options: ExplorationOptions = Field(default_factory=ExplorationOptions)

    @model_validator(mode="after")
    def combination_budget(self):
        if not self.name.strip() or len(set(self.site_ids)) != len(self.site_ids):
            raise ValueError("Name must be visible and selected site hypotheses must be distinct.")
        if len({row.reference for row in self.ligands}) != len(self.ligands):
            raise ValueError("Select each exact ligand/state/conformer version only once.")
        count = len(self.site_ids) * len(self.ligands) * self.options.seed_count
        if count > self.options.max_jobs:
            raise ValueError("Site × ligand × initialization combinations exceed the job budget.")
        # The existing Worker executes one job at a time; reserve native limits plus
        # a bounded startup allowance, rather than claiming parallel completion.
        reserved = count * (self.options.docking.time_limit_seconds + 30)
        if reserved > self.options.wall_seconds:
            raise ValueError("Workflow duration does not cover all native time limits and startup.")
        return self


class PoseCombination(ScientificModel):
    step_id: str = Field(pattern=r"^pose_[0-9]{3}$")
    site_id: str = Field(pattern=r"^m[0-9]{2}-p[0-9]{1,6}$")
    member_index: int = Field(ge=0, le=15)
    pocket_rank: int = Field(ge=1, le=100000)
    receptor: MoleculeRef
    ligand_index: int = Field(ge=0, le=11)
    ligand: ExplorationLigand
    seed: int = Field(strict=True, ge=0, le=2147483647)
