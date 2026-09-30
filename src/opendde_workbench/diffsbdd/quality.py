"""Typed independent result evidence, readable without loading scientific libraries."""

import hashlib
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel


class CoreAtomMapping(ScientificModel):
    source_atom: int = Field(ge=0, le=4999)
    output_atom: int = Field(ge=0, le=4999)


class CoreCandidate(ScientificModel):
    record: int = Field(ge=0, le=99)
    qualified_record: int | None = Field(default=None, ge=0, le=99)
    diagnostic_artifact: str | None = Field(
        default=None, pattern=r"^diagnostic-core-[0-9]{3}\.sdf$"
    )
    method: Literal["rdkit_fixed_core_v1"]
    status: Literal["passed", "failed", "indeterminate"]
    reason: str | None = Field(default=None, max_length=120)
    preserve_bonds: bool
    tolerance_angstrom: Literal[0.5]
    unit: Literal["angstrom"]
    search_states: int = Field(ge=1, le=10000)
    mapping: tuple[CoreAtomMapping, ...] = Field(max_length=80)
    maximum_displacement: float | None = Field(default=None, ge=0, le=0.5, allow_inf_nan=False)

    @model_validator(mode="after")
    def consistent(self):
        passed = self.status == "passed"
        if passed != (self.qualified_record is not None) or passed != (self.reason is None):
            raise ValueError("Core qualification and diagnostic evidence disagree.")
        if passed:
            if not self.mapping or self.diagnostic_artifact or self.maximum_displacement is None:
                raise ValueError("Qualified core requires a complete mapping and displacement.")
        elif self.mapping or self.maximum_displacement is not None or not self.diagnostic_artifact:
            raise ValueError("Unqualified core must remain a diagnostic candidate.")
        if len({m.output_atom for m in self.mapping}) != len(self.mapping):
            raise ValueError("Core mapping must be one-to-one.")
        return self


class CoreVerification(ScientificModel):
    schema_version: Literal[1]
    method: Literal["rdkit_fixed_core_v1"]
    source: MoleculeRef
    fixed_atoms: tuple[int, ...] = Field(min_length=1, max_length=80)
    preserve_bonds: bool
    raw_artifact: str = Field(
        max_length=240, pattern=r"^native/(?:[a-zA-Z0-9_-]+/)*molecules\.sdf$"
    )
    raw_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    qualified_artifact: Literal["qualified-molecules.sdf"]
    qualified_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    qualified_count: int = Field(ge=0, le=100)
    candidates: tuple[CoreCandidate, ...] = Field(max_length=100)

    @model_validator(mode="after")
    def consistent(self):
        if len(set(self.fixed_atoms)) != len(self.fixed_atoms) or any(
            i < 0 or i > 4999 for i in self.fixed_atoms
        ):
            raise ValueError("Core source indices are invalid.")
        if [c.record for c in self.candidates] != list(range(len(self.candidates))):
            raise ValueError("Core candidate records must be complete and ordered.")
        passed = [c for c in self.candidates if c.status == "passed"]
        if self.qualified_count != len(passed) or [c.qualified_record for c in passed] != list(
            range(len(passed))
        ):
            raise ValueError("Qualified core record count/order disagree.")
        for candidate in self.candidates:
            if candidate.preserve_bonds != self.preserve_bonds or (
                candidate.status == "passed"
                and [m.source_atom for m in candidate.mapping] != list(self.fixed_atoms)
            ):
                raise ValueError("Core check does not cover the exact declared selection.")
        return self


def validate_verification(result, request, output: Path):
    if (
        result.get("operation") != "diffsbdd"
        or result.get("mode") != "inpaint"
        or result.get("complete") is not True
    ):
        raise ValueError("Core verification must belong to a completed inpainting result.")
    evidence = CoreVerification.model_validate(result["core_verification"])
    payload = request.payload
    if (
        payload.mode != "inpaint"
        or evidence.source != payload.initial
        or list(evidence.fixed_atoms) != payload.options.fixed_atoms
        or evidence.preserve_bonds != payload.options.preserve_bonds
    ):
        raise ValueError("Core verification differs from the immutable inpainting request.")
    if (
        result.get("valid") != evidence.qualified_count
        or result.get("native_valid") != len(evidence.candidates)
        or result.get("molecule_artifact") != evidence.qualified_artifact
    ):
        raise ValueError("Generation result and qualified core evidence disagree.")
    for name, checksum, records in [
        (evidence.raw_artifact, evidence.raw_sha256, len(evidence.candidates)),
        (evidence.qualified_artifact, evidence.qualified_sha256, evidence.qualified_count),
    ]:
        file = contained(output, name)
        if (
            file.stat().st_size > 25 * 1024**2
            or hashlib.sha256(file.read_bytes()).hexdigest() != checksum
        ):
            raise ValueError("Verified molecule bundle changed after checking.")
        if len([p for p in file.read_text(encoding="utf-8").split("$$$$") if p.strip()]) != records:
            raise ValueError("Verified molecule record count changed.")
    for candidate in evidence.candidates:
        if candidate.diagnostic_artifact:
            file = contained(output, candidate.diagnostic_artifact)
            if file.stat().st_size > 25 * 1024**2:
                raise ValueError("Core diagnostic exceeds the output limit.")
    return evidence
