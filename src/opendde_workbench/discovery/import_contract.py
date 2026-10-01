"""Public archive records use bounded identifiers and optional exact evidence provenance."""

import re
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from ..scientific_objects import MoleculeRef
from ..task_metadata import TaskMetadata


class ReferenceImportTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["reference_import"] = "reference_import"
    name: str = Field(
        default="Reference material", min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$"
    )
    project_id: UUID | None = None
    source: Literal["pdb", "chembl"]
    identifier: str = Field(min_length=4, max_length=24)
    format: Literal["cif", "pdb", "sdf"]
    evidence: MoleculeRef | None = None
    activity_id: int | None = Field(default=None, ge=1)
    allow_external: Literal[True]

    @field_validator("identifier")
    @classmethod
    def canonical_identifier(cls, value):
        return value.strip().upper()

    @model_validator(mode="after")
    def source_contract(self) -> Self:
        if self.constraints:
            raise ValueError("Archive import does not execute molecular constraints.")
        if self.source == "pdb":
            if not re.fullmatch(r"(?:[0-9][A-Z0-9]{3}|PDB_[A-Z0-9]{8})", self.identifier):
                raise ValueError("Choose a valid PDB accession.")
            if self.format == "sdf" or self.activity_id is not None:
                raise ValueError("Protein archives require a PDB/mmCIF structure format.")
            if self.identifier.startswith("PDB_") and self.format == "pdb":
                raise ValueError("Extended PDB identifiers require mmCIF.")
        elif not re.fullmatch(r"CHEMBL[0-9]{1,12}", self.identifier) or self.format != "sdf":
            raise ValueError("Choose a ChEMBL molecule accession and SDF format.")
        if self.activity_id is not None and self.evidence is None:
            raise ValueError("Measured activity provenance requires the exact evidence version.")
        expected = [self.evidence] if self.evidence else []
        if self.scientific_inputs != expected:
            raise ValueError(
                "Archive provenance must refer to the exact selected evidence version."
            )
        if self.source == "chembl" and self.evidence and self.activity_id is None:
            raise ValueError("Select the exact activity record when reusing measured evidence.")
        return self
