"""Typed immutable library evidence; original record identities and finite metrics stay explicit."""

import hashlib
from typing import Literal

from pydantic import Field, model_validator

from ..artifacts import contained
from ..scientific_objects import MoleculeRef, ScientificModel
from .screen_contract import LibraryRef
from .screen_evidence import ScaffoldGroup, StructuralAlert, validate_inspection
from .screen_options import ScreenOptions


class Descriptors(ScientificModel):
    smiles: str = Field(min_length=1, max_length=10000)
    mw: float = Field(ge=0, allow_inf_nan=False)
    logp: float = Field(allow_inf_nan=False)
    tpsa: float = Field(ge=0, allow_inf_nan=False)
    qed: float = Field(ge=0, le=1, allow_inf_nan=False)
    hbd: int = Field(ge=0, le=256)
    hba: int = Field(ge=0, le=256)
    rotatable_bonds: int = Field(ge=0, le=256)
    fragments: int = Field(ge=1, le=256)


class ScreenRow(ScientificModel):
    record: int = Field(ge=0, le=499)
    available: bool
    eligible: bool
    selected: bool
    output_record: int | None = Field(default=None, ge=0, le=99)
    similarity: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    substructure_match: bool | None = None
    reason: str | None = Field(default=None, max_length=500)
    reason_code: (
        Literal[
            "duplicate",
            "similarity_threshold",
            "substructure_mismatch",
            "descriptor_range",
            "count_budget",
            "invalid_record",
            "structural_alert",
            "scaffold_quota",
            "multiple_fragments",
        ]
        | None
    ) = None
    duplicate_of: int | None = Field(default=None, ge=0, le=499)
    descriptors: Descriptors | None = None
    structural_alerts: tuple[StructuralAlert, ...] | None = Field(default=None, max_length=1000)
    scaffold_group: int | None = Field(default=None, ge=0, le=499)

    @model_validator(mode="after")
    def coherent(self):
        if self.available != (self.descriptors is not None) or self.selected != (
            self.output_record is not None
        ):
            raise ValueError("Library record availability/selection is inconsistent.")
        if (self.selected and not self.eligible) or (self.eligible and not self.available):
            raise ValueError("Only valid eligible records can be selected.")
        if (self.reason_code == "duplicate") != (self.duplicate_of is not None):
            raise ValueError("Duplicate record evidence is inconsistent.")
        if not self.selected and (not self.reason or not self.reason_code):
            raise ValueError("Unselected records require an explicit reason.")
        return self


class Fingerprint(ScientificModel):
    method: Literal["Morgan"]
    radius: Literal[2]
    bits: Literal[2048]
    chirality: Literal[True]


class LibraryScreenResult(ScientificModel):
    operation: Literal["library_screen"]
    complete: Literal[True]
    schema_version: Literal[1, 2]
    library: LibraryRef
    query: MoleculeRef | None
    options: ScreenOptions
    rows: tuple[ScreenRow, ...] = Field(min_length=1, max_length=500)
    selected_records: tuple[int, ...] = Field(max_length=100)
    artifact: Literal["selected.sdf"]
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    versions: dict[str, str]
    fingerprint: Fingerprint
    scope: Literal["chemical_library_selection_not_activity_admet_or_binding_prediction"]
    chemical_processing: Literal["original_records_no_salt_stripping_or_state_enumeration"]
    coordinate_frame: Literal["retained_input_coordinates_not_inferred_binding_pose"]
    scaffold_groups: tuple[ScaffoldGroup, ...] | None = Field(default=None, max_length=500)
    scaffold_method: Literal["murcko_chiral_acyclic_exact"] | None = None
    report_artifact: Literal["library-report.csv"] | None = None
    report_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def complete_records(self):
        if [row.record for row in self.rows] != list(range(len(self.rows))):
            raise ValueError(
                "Every original library record must be represented, including failures."
            )
        if len(self.selected_records) > self.options.max_selected or len(
            set(self.selected_records)
        ) != len(self.selected_records):
            raise ValueError("Selected library records exceed the budget or contain duplicates.")
        selected = sorted(
            (row for row in self.rows if row.selected), key=lambda row: row.output_record
        )
        if [row.record for row in selected] != list(self.selected_records) or [
            row.output_record for row in selected
        ] != list(range(len(selected))):
            raise ValueError("Library selection/output record mapping is inconsistent.")
        for row in self.rows:
            if row.available:
                if (self.options.mode == "similarity") != (row.similarity is not None) or (
                    self.options.mode == "substructure"
                ) != (row.substructure_match is not None):
                    raise ValueError("Library search metric differs from the selected method.")
                if (
                    self.options.mode == "similarity"
                    and row.eligible
                    and row.similarity < self.options.minimum_similarity
                ):
                    raise ValueError("Selected similarity criterion is not satisfied.")
                if (
                    self.options.mode == "substructure"
                    and row.eligible
                    and not row.substructure_match
                ):
                    raise ValueError("Selected substructure criterion is not satisfied.")
                if (
                    self.options.mode == "filter"
                    and row.eligible
                    and not (
                        self.options.minimum_mw <= row.descriptors.mw <= self.options.maximum_mw
                        and self.options.minimum_logp
                        <= row.descriptors.logp
                        <= self.options.maximum_logp
                    )
                ):
                    raise ValueError("Selected descriptor limits are not satisfied.")
        validate_inspection(self)
        return self


def validate_screen(value, task, output):
    result = LibraryScreenResult.model_validate(value)
    if (
        result.library != task.library
        or result.query != task.query
        or result.options != task.options
        or result.versions != {"rdkit": "2023.09.6"}
    ):
        raise ValueError("Library source/query/options/software differ from the selected task.")
    file = contained(output, result.artifact)
    raw = file.read_bytes()
    if len(raw) > 25 * 1024**2 or hashlib.sha256(raw).hexdigest() != result.sha256:
        raise ValueError("Selected library artifact bytes changed.")
    if raw.decode("utf-8").count("$$$$") != len(result.selected_records):
        raise ValueError("Selected library output record count differs from the report.")
    if result.report_artifact:
        report = contained(output, result.report_artifact).read_bytes()
        if len(report) > 25 * 1024**2 or hashlib.sha256(report).hexdigest() != result.report_sha256:
            raise ValueError("Library selection report bytes changed.")
    return result
