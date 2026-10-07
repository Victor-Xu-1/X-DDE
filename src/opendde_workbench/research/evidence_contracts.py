"""Reported experimental observations retain units, conditions and immutable sources."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, model_validator

from ..scientific_objects import MoleculeRef, ScientificModel

Text = Annotated[str, Field(max_length=240, pattern=r"^[^\x00-\x1f\x7f]*$")]
Endpoint = Literal[
    "KD", "Ki", "IC50", "EC50", "DC50", "Dmax", "inhibition", "expression", "qualitative"
]
Relation = Literal["=", "<", "<=", ">", ">=", "~"]


class AssayConditions(ScientificModel):
    target: Text
    assay: Text
    species: Text = ""
    construct_id: Text = ""
    batch: Text = ""
    temperature_c: float | None = Field(default=None, ge=-20, le=150, allow_inf_nan=False)
    ph: float | None = Field(default=None, ge=0, le=14, allow_inf_nan=False)
    buffer: Text = ""
    method: Text = ""

    @model_validator(mode="after")
    def explicit_context(self):
        if not self.target.strip() or not self.assay.strip():
            raise ValueError("Provide the actual target or phenotype and assay identity.")
        return self


class EvidenceColumns(ScientificModel):
    compound: Text = "compound_id"
    value: Text = "value"
    relation: Text = ""
    replicate: Text = ""
    endpoint: Text = ""
    unit: Text = ""
    uncertainty: Text = ""
    batch: Text = ""

    @model_validator(mode="after")
    def columns_are_distinct(self):
        names = [value for value in self.model_dump().values() if value]
        if not self.compound or not self.value or len(names) != len(set(names)):
            raise ValueError("Choose distinct existing compound, value and optional columns.")
        return self


class ReportedUncertainty(ScientificModel):
    kind: Literal["sd", "sem"]
    value: float = Field(ge=0, allow_inf_nan=False)
    unit: str


class EvidenceInput(ScientificModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f\x7f]+$")
    source: MoleculeRef
    conditions: AssayConditions
    endpoint: Endpoint = "IC50"
    unit: Text = "nM"
    columns: EvidenceColumns = Field(default_factory=EvidenceColumns)
    delimiter: Literal[",", "\t", ";"] = ","
    uncertainty_kind: Literal["sd", "sem"] = "sd"
    citation: str = Field(min_length=1, max_length=2000)
    reported_by: Text = ""
    compound_links: dict[Text, MoleculeRef] = Field(default_factory=dict, max_length=1000)
    parent_id: UUID | None = None

    @model_validator(mode="after")
    def whole_original_file(self):
        if self.source.record or self.source.conformer or self.source.version_id:
            raise ValueError("Experimental tables use the exact whole uploaded file.")
        if not self.name.strip() or not self.citation.strip():
            raise ValueError("Name and reported source must be explicit.")
        return self


class EvidenceObservation(ScientificModel):
    id: str
    source_row: int = Field(ge=2)
    compound: str
    molecule: MoleculeRef | None = None
    material_kind: Literal["molecule", "sequence", "structure"] | None = None
    endpoint: Endpoint
    reported_value: str
    reported_unit: str
    relation: Relation
    replicate: str
    conditions: AssayConditions
    value: float | None = Field(default=None, allow_inf_nan=False)
    normalized_value: float | None = Field(default=None, allow_inf_nan=False)
    normalized_unit: str
    uncertainty: ReportedUncertainty | None = None
    issues: tuple[str, ...] = ()
    comparison_group: str = Field(pattern=r"^[a-f0-9]{64}$")


class EvidenceDocument(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    request: EvidenceInput
    observations: tuple[EvidenceObservation, ...] = Field(min_length=1, max_length=1000)
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    created_at: str
    source_kind: Literal["reported_experimental_observations"] = (
        "reported_experimental_observations"
    )
    analysis_scope: Literal["unit_normalization_and_condition_matched_summary"] = (
        "unit_normalization_and_condition_matched_summary"
    )

    @model_validator(mode="after")
    def source_identity(self):
        if self.source_sha256 != self.request.source.sha256:
            raise ValueError("The experimental source differs from its bound file.")
        if len({row.id for row in self.observations}) != len(self.observations):
            raise ValueError("Each source observation must have a unique row identity.")
        return self
