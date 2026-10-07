"""Strict exposure evidence: exact source, region, conditions, sums and files."""

import hashlib
import math
from typing import Literal

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from .surface_options import SurfaceOptions, SurfaceRegion


class SurfaceRow(SurfaceRegion):
    isolated_area: float = Field(ge=0, allow_inf_nan=False)
    assembly_area: float = Field(ge=0, allow_inf_nan=False)
    buried_area: float = Field(ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def areas(self):
        if not math.isclose(
            self.isolated_area - self.assembly_area, self.buried_area, abs_tol=1e-6
        ):
            raise ValueError("Surface area occlusion is inconsistent.")
        return self


class SurfaceResidue(SurfaceRow):
    atom_count: int = Field(ge=1, le=5000)


class SurfaceAtom(SurfaceRow):
    atom: str = Field(min_length=1, max_length=8)
    element: str = Field(min_length=1, max_length=2)


class SurfaceInspection(ScientificModel):
    source_format: Literal["pdb", "mmcif"]
    source_model_count: int = Field(ge=1, le=100)
    selected_model_index: int = Field(ge=0, le=99)
    selected_chains: tuple[str, ...] = Field(min_length=1, max_length=16)
    parser_warnings: tuple[str, ...] = Field(max_length=20)
    parser_warnings_truncated: bool


class SurfaceResult(ScientificModel):
    operation: Literal["surface_exposure"]
    complete: Literal[True]
    schema_version: Literal[1]
    source: MoleculeRef
    regions: tuple[SurfaceRegion, ...] = Field(min_length=1, max_length=128)
    options: SurfaceOptions
    inspection: SurfaceInspection
    removed: dict[str, int]
    context_atoms: int = Field(ge=1, le=30000)
    target_atoms: int = Field(ge=1, le=5000)
    residues: tuple[SurfaceResidue, ...] = Field(min_length=1, max_length=128)
    atoms: tuple[SurfaceAtom, ...] = Field(min_length=1, max_length=5000)
    isolated_area: float = Field(ge=0, allow_inf_nan=False)
    assembly_area: float = Field(ge=0, allow_inf_nan=False)
    buried_area: float = Field(ge=0, allow_inf_nan=False)
    artifacts: dict[str, str]
    preview_artifact: Literal["context.pdb", "context.cif"]
    area_unit: Literal["angstrom_squared"]
    coordinate_frame: Literal["source_coordinates_selected_model"]
    method: Literal["Biopython Shrake-Rupley"]
    radii_angstrom: dict[str, float]
    atom_policy: Literal["observed_heavy_atoms_without_water"]
    biological_assembly: Literal["provided_coordinates_only"]
    scope: Literal["surface_accessibility_not_energy_affinity_or_linker_passage"]
    versions: dict[str, str]


def region(row):
    return SurfaceRegion(**{key: getattr(row, key) for key in SurfaceRegion.model_fields})


def validate_surface(value, request, output):
    result = SurfaceResult.model_validate(value)
    if (
        result.source != request.structure
        or result.options != request.options
        or result.regions != request.regions
    ):
        raise ValueError("Surface source, region or measurement conditions differ from this task.")
    inspection = result.inspection
    if (
        inspection.selected_model_index != request.options.model_index
        or inspection.selected_model_index >= inspection.source_model_count
    ):
        raise ValueError("Surface structural model differs from the requested source.")
    if request.options.context_chains and set(inspection.selected_chains) != set(
        request.options.context_chains
    ):
        raise ValueError("Surface context chains differ from the request.")
    if not {r.chain for r in request.regions} <= set(inspection.selected_chains):
        raise ValueError("Surface target is outside the reported context.")
    if set(result.removed) != {"water_residues", "hydrogen_atoms"} or any(
        v < 0 for v in result.removed.values()
    ):
        raise ValueError("Surface observed-atom policy record is incomplete.")
    if result.versions != {"biopython": "1.88"}:
        raise ValueError("Surface measurements require reviewed Biopython 1.88.")
    if tuple(region(r) for r in result.residues) != request.regions:
        raise ValueError("Measured residues differ from the exact requested region.")
    if (
        result.target_atoms != len(result.atoms)
        or result.context_atoms < result.target_atoms
        or result.context_atoms * result.options.sphere_points > 30000000
    ):
        raise ValueError("Surface atom counts violate the measurement budget.")
    if len({(region(a), a.atom) for a in result.atoms}) != result.target_atoms:
        raise ValueError("Surface atom identities are duplicated.")
    if {region(a) for a in result.atoms} != set(request.regions):
        raise ValueError("Surface atoms do not match requested residue identities.")
    expected_radii = {
        "C": 1.7,
        "N": 1.55,
        "O": 1.52,
        "F": 1.47,
        "P": 1.8,
        "S": 1.8,
        "CL": 1.75,
        "BR": 1.85,
        "I": 1.98,
        "SE": 1.9,
    }
    if (
        not result.radii_angstrom
        or any(expected_radii.get(e) != v for e, v in result.radii_angstrom.items())
        or any(a.element not in result.radii_angstrom for a in result.atoms)
    ):
        raise ValueError("Surface element radii are missing or not reviewed.")
    for residue in result.residues:
        atoms = [a for a in result.atoms if region(a) == region(residue)]
        if len(atoms) != residue.atom_count:
            raise ValueError("Surface residue atom count differs from its measurement rows.")
        for metric in ("isolated_area", "assembly_area", "buried_area"):
            if not math.isclose(
                sum(getattr(a, metric) for a in atoms), getattr(residue, metric), abs_tol=1e-6
            ):
                raise ValueError("Surface residue totals are inconsistent.")
    for metric in ("isolated_area", "assembly_area", "buried_area"):
        if not math.isclose(
            sum(getattr(row, metric) for row in result.residues),
            getattr(result, metric),
            abs_tol=1e-6,
        ):
            raise ValueError("Surface region totals are inconsistent.")
    if set(result.artifacts) != {result.preview_artifact, "regions.csv", "atoms.csv"}:
        raise ValueError("Surface evidence artifacts are incomplete.")
    for name, checksum in result.artifacts.items():
        file = contained(output, name)
        if (
            not 0 < file.stat().st_size <= 25 * 1024**2
            or hashlib.sha256(file.read_bytes()).hexdigest() != checksum
        ):
            raise ValueError("Surface evidence file changed.")
    return result
