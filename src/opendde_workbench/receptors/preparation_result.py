"""Typed preparation report, source/options and immutable artifact validation."""

import hashlib
from typing import Literal

from pydantic import Field

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from .preparation_options import PreparationOptions


class RemovedResidue(ScientificModel):
    chain: str = Field(max_length=8)
    number: int
    insertion_code: str = Field(max_length=1)
    resname: str = Field(max_length=8)
    reason: Literal["water", "heterogen"]


class ResolvedAlternate(ScientificModel):
    chain: str = Field(max_length=8)
    number: int
    insertion_code: str = Field(max_length=1)
    resname: str = Field(max_length=8)
    atom: str = Field(max_length=8)
    alternate: str = Field(min_length=1, max_length=1)


class Inspection(ScientificModel):
    model_count: int = Field(ge=1, le=100)
    selected_chains: tuple[str, ...] = Field(min_length=1, max_length=16)
    parser_warnings: tuple[str, ...] = Field(max_length=20)
    parser_warnings_truncated: bool


class StructurePrepareResult(ScientificModel):
    operation: Literal["structure_prepare"]
    complete: Literal[True]
    schema_version: Literal[1]
    source: MoleculeRef
    options: PreparationOptions
    artifact: Literal["prepared.pdb", "prepared.cif"]
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    inspection: Inspection
    atom_count: int = Field(ge=3, le=100000)
    removed_residues: tuple[RemovedResidue, ...] = Field(max_length=100000)
    resolved_alternates: tuple[ResolvedAlternate, ...] = Field(max_length=100000)
    versions: dict[str, str]
    coordinate_frame: Literal["source_coordinates_selected_model"]
    coordinate_unit: Literal["angstrom"]
    scope: Literal["observed_selection_and_format_export_not_chemical_preparation"]
    unobserved_atoms: Literal["not_generated"]
    biological_assembly: Literal["provided_coordinates_only"]


def validate_preparation(value, request, output):
    result = StructurePrepareResult.model_validate(value)
    if (
        result.source != request.structure
        or result.options != request.options
        or result.artifact != "prepared." + request.options.format
        or result.versions != {"biopython": "1.86"}
    ):
        raise ValueError("Prepared structural source/options/software differ from this task.")
    if result.options.model_index >= result.inspection.model_count or (
        result.options.chains
        and set(result.options.chains) != set(result.inspection.selected_chains)
    ):
        raise ValueError("Prepared model/chain selection does not match the requested source.")
    file = contained(output, result.artifact)
    if (
        not 0 < file.stat().st_size <= 25 * 1024**2
        or hashlib.sha256(file.read_bytes()).hexdigest() != result.sha256
    ):
        raise ValueError("Prepared structure bytes changed.")
    return result
