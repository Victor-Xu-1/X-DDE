"""Finite native geometry and separate coordinate/measurement provenance."""

import math
from typing import Annotated, Any, Literal

from pydantic import Field, StrictFloat, model_validator

from ..receptors.preparation_result import StructurePrepareResult
from ..receptors.surface_options import SurfaceRegion
from ..scientific_objects import MoleculeRef, ScientificModel
from .options import ChannelOptions

Scalar = Annotated[StrictFloat, Field(allow_inf_nan=False)]
Nonnegative = Annotated[StrictFloat, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[StrictFloat, Field(gt=0, allow_inf_nan=False)]
Vec = tuple[Scalar, Scalar, Scalar]
DIGEST = r"^[a-f0-9]{64}$"


class ContextAnchor(SurfaceRegion):
    atoms: tuple[Literal["N"], Literal["CA"], Literal["C"]]


class ComputationalFrame(ScientificModel):
    method: Literal["source_point_and_first_complete_backbone_proper_rigid_frame"]
    origin: Vec
    basis: tuple[Vec, Vec, Vec]
    context_anchor: ContextAnchor
    coordinate_unit: Literal["angstrom"]
    maximum_rounding_error_angstrom: Nonnegative
    observed_rounding_error_angstrom: Nonnegative

    @model_validator(mode="after")
    def proper_rotation(self):
        if any(abs(v) > 100000 for v in self.origin):
            raise ValueError("The source origin exceeds the supported frame.")
        for i, left in enumerate(self.basis):
            for j, right in enumerate(self.basis):
                dot = sum(a * b for a, b in zip(left, right, strict=True))
                if abs(dot - (1 if i == j else 0)) > 1e-8:
                    raise ValueError("The native computational basis is not orthonormal.")
        x, y, z = self.basis
        cross = (x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0])
        if abs(sum(a * b for a, b in zip(cross, z, strict=True)) - 1) > 1e-8:
            raise ValueError("Reflection cannot be used as a computational coordinate transform.")
        if abs(self.maximum_rounding_error_angstrom - math.sqrt(3) * 0.0005) > 1e-12 or (
            self.observed_rounding_error_angstrom > self.maximum_rounding_error_angstrom + 1e-9
        ):
            raise ValueError("Native export exceeded its declared coordinate error bound.")
        return self


class ChannelPoint(ScientificModel):
    position: Vec
    radius_angstrom: Positive
    native_profile_distance_angstrom: Nonnegative
    sample_polyline_distance_angstrom: Nonnegative
    distance_from_start_angstrom: Nonnegative
    radius_error_bound_angstrom: Nonnegative | None

    @model_validator(mode="after")
    def bounded_coordinates(self):
        if any(abs(v) > 100000 for v in self.position):
            raise ValueError("Channel coordinates exceed the finite original-frame domain.")
        return self


class Channel(ScientificModel):
    cluster: int = Field(strict=True, ge=1, le=10000)
    tunnel: int = Field(strict=True, ge=1, le=10000)
    bottleneck_radius_angstrom: Positive
    length_angstrom: Positive
    curvature: Annotated[StrictFloat, Field(ge=0.999999, allow_inf_nan=False)]
    native_geometric_throughput: Annotated[StrictFloat, Field(ge=0, le=1, allow_inf_nan=False)]
    native_geometric_cost: Nonnegative
    radius_error_bounds_angstrom: tuple[Nonnegative | None, Nonnegative | None, Nonnegative | None]
    points: tuple[ChannelPoint, ...] = Field(min_length=2, max_length=10000)


class Context(ScientificModel):
    source: dict[str, Any]
    quality: dict[str, Any]
    obstacle_atoms: int = Field(strict=True, ge=20, le=15000)
    source_point: Vec
    removed_starting_ligand_count: int = Field(strict=True, ge=0, le=12)
    radius_table_sha256: str = Field(pattern=DIGEST)


class ChannelResult(ScientificModel):
    operation: Literal["channel_analysis"]
    complete: Literal[True]
    schema_version: Literal[1]
    structure: MoleculeRef
    starting_regions: tuple[SurfaceRegion, ...] = Field(min_length=1, max_length=12)
    options: ChannelOptions
    frame: ComputationalFrame
    preparation: StructurePrepareResult
    context: Context
    channels: tuple[Channel, ...] = Field(max_length=500)
    requested_start: Vec
    native_start: Vec
    native_start_displacement_angstrom: Nonnegative
    coordinate_frame: Literal["original_selected_structural_model"]
    coordinate_unit: Literal["angstrom"]
    search_scope: Literal["declared_probe_and_bounded_native_candidates"]
    outcome: Literal["paths_found", "not_found_within_declared_conditions"]
    artifacts: dict[str, str] = Field(min_length=10, max_length=10)
    versions: dict[str, str]
    scientific_scope: Literal["static_geometric_channels_not_whole_linker_passage_or_energy"]

    @model_validator(mode="after")
    def complete_coverage(self):
        if len({(r.cluster, r.tunnel) for r in self.channels}) != len(self.channels) or (
            sum(len(r.points) for r in self.channels) > 50000
        ):
            raise ValueError("Native channels are duplicated or exceed the declared point budget.")
        if self.outcome != (
            "paths_found" if self.channels else "not_found_within_declared_conditions"
        ):
            raise ValueError("The bounded-search outcome differs from the actual native evidence.")
        return self
