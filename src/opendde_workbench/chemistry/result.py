"""Typed state/conformer evidence and immutable output-file validation."""

import hashlib
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from .options import StateOptions


class PreparedState(ScientificModel):
    index: int = Field(ge=0, le=63)
    smiles: str = Field(min_length=1, max_length=5000)
    charge: int = Field(ge=-128, le=128)
    formula: str = Field(min_length=1, max_length=500)
    source_to_state_atoms: tuple[int, ...] = Field(min_length=1, max_length=128)
    conformer_status: Literal[
        "completed", "not_requested", "embedding_failed", "force_field_parameters_unavailable"
    ]


class PreparedConformer(ScientificModel):
    record: int = Field(ge=0, le=255)
    state_index: int = Field(ge=0, le=63)
    native_conformer: int = Field(ge=0, le=15)
    artifact: str = Field(pattern=r"^conformer-[0-9]{3}\.sdf$")
    artifact_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_to_conformer_atoms: tuple[int, ...] = Field(min_length=1, max_length=128)
    energy: float | None = Field(default=None, allow_inf_nan=False)
    converged: bool | None = None


class StateCoverage(ScientificModel):
    budget_limited: bool
    enumeration_work: int = Field(ge=0, le=513)
    rejected: int = Field(ge=0, le=513)
    protonation_rejected: int = Field(ge=0, le=1000000)
    population_probabilities: Literal["not_computed"]


class MolecularStatesResult(ScientificModel):
    operation: Literal["molecular_states"]
    complete: Literal[True]
    schema_version: Literal[1]
    source: MoleculeRef
    options: StateOptions
    states: tuple[PreparedState, ...] = Field(min_length=1, max_length=64)
    conformers: tuple[PreparedConformer, ...] = Field(max_length=256)
    coverage: StateCoverage
    state_artifact: Literal["states.sdf"]
    conformer_artifact: Literal["conformers.sdf"]
    artifact_sha256: dict[str, str]
    versions: dict[str, str]
    geometry_frame: Literal["unbound_conformer"]
    energy_unit: Literal["kcal/mol"]
    energy_comparison: Literal["same_state_only"]

    @model_validator(mode="after")
    def consistency(self):
        if (
            len(self.states) > self.options.max_states
            or len(self.conformers) > self.options.max_records
        ):
            raise ValueError("Prepared molecular set exceeds its declared budget.")
        if [s.index for s in self.states] != list(range(len(self.states))) or [
            c.record for c in self.conformers
        ] != list(range(len(self.conformers))):
            raise ValueError("Prepared molecular records are not complete and ordered.")
        atom_count = len(self.states[0].source_to_state_atoms)
        counts = [0] * len(self.states)
        for row in (*self.states, *self.conformers):
            mapping = (
                row.source_to_state_atoms
                if isinstance(row, PreparedState)
                else row.source_to_conformer_atoms
            )
            if len(mapping) != atom_count or sorted(mapping) != list(range(atom_count)):
                raise ValueError("Prepared atom identity is not one-to-one.")
        for conf in self.conformers:
            if (
                conf.state_index >= len(self.states)
                or self.states[conf.state_index].conformer_status != "completed"
            ):
                raise ValueError("Conformer refers to a missing or failed chemical state.")
            counts[conf.state_index] += 1
            if (
                self.options.force_field == "none"
                and (conf.energy is not None or conf.converged is not None)
            ) or (
                self.options.force_field != "none"
                and (conf.energy is None or conf.converged is None)
            ):
                raise ValueError("Conformer force-field evidence is inconsistent.")
        for state, count in zip(self.states, counts, strict=True):
            if count > self.options.conformers_per_state or (
                state.conformer_status == "completed"
            ) != (count > 0):
                raise ValueError("State conformer count/status differs from its declared budget.")
            if (self.options.conformers_per_state == 0) != (
                state.conformer_status == "not_requested"
            ):
                raise ValueError("Conformer status differs from the requested preparation mode.")
        if len({c.artifact for c in self.conformers}) != len(self.conformers):
            raise ValueError("Conformer preview identities are duplicated.")
        if set(self.artifact_sha256) != {self.state_artifact, self.conformer_artifact} or any(
            len(v) != 64 or any(c not in "0123456789abcdef" for c in v)
            for v in self.artifact_sha256.values()
        ):
            raise ValueError("Molecular set file digests are invalid.")
        if set(self.versions) != {"rdkit", "dimorphite_dl"} or any(
            not v or len(v) > 80 for v in self.versions.values()
        ):
            raise ValueError("Molecular preparation must record its actual library versions.")
        return self


def validate_result(value, request, output: Path):
    result = MolecularStatesResult.model_validate(value)
    if result.source != request.molecule or result.options != request.options:
        raise ValueError("Prepared molecular set differs from the exact input/options snapshot.")
    for name, records in [
        (result.state_artifact, len(result.states)),
        (result.conformer_artifact, len(result.conformers)),
    ]:
        file = contained(output, name)
        if file.stat().st_size > 25 * 1024**2:
            raise ValueError("Prepared molecular bundle exceeds its file limit.")
        content = file.read_bytes()
        if hashlib.sha256(content).hexdigest() != result.artifact_sha256[name]:
            raise ValueError("Prepared molecular bundle changed after verification.")
        if len([p for p in content.decode("utf-8").split("$$$$") if p.strip()]) != records:
            raise ValueError("Prepared molecular bundle record count is inconsistent.")
    for conf in result.conformers:
        file = contained(output, conf.artifact)
        if (
            file.stat().st_size > 1024**2
            or hashlib.sha256(file.read_bytes()).hexdigest() != conf.artifact_sha256
        ):
            raise ValueError("Conformer preview changed after verification.")
    return result
