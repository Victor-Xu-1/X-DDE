"""Bounded result summaries bind large artifacts and every candidate to exact sources."""

import hashlib
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..artifacts import contained
from .integrity import verified

RESULT_KINDS = {
    "library_prepare": "library",
    "library_subset": "screening",
    "drugclip_index": "index",
    "drugclip_retrieve": "screening",
    "screening_dock": "screening",
    "del_validate": "definition",
    "del_enumerate": "library",
    "del_decode": "decoded",
    "del_count": "counts",
    "del_analyze": "analysis",
    "del_series": "analysis",
    "del_model": "model",
    "del_candidates": "screening",
    "del_followup": "analysis",
}


class DataArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    size: int = Field(gt=0, le=50 * 1024**3)
    format: Literal["sqlite", "hdf5", "csv", "json", "sdf", "pdb", "cif", "ndjson", "model"]
    role: str = Field(min_length=1, max_length=40)


class DataCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=240)
    display_name: str = Field(default="", max_length=240)
    source_job: str | None = Field(default=None, min_length=1, max_length=36)
    source_asset: str | None = Field(default=None, min_length=1, max_length=36)
    source_record: int = Field(ge=0, le=100000000)
    supplier: str = Field(default="", max_length=120)
    smiles: str = Field(default="", max_length=20000)
    score: float | None = None
    raw_score: float | None = None
    docking_score: float | None = None
    cnn_score: float | None = None
    cnn_affinity: float | None = None
    artifact: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    record: int = Field(default=0, ge=0, le=499)
    geometry: Literal["none", "unbound_conformer", "binding_pose"] = "none"


class DatasetResult(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    operation: str
    program: str
    version: str
    schema_version: Literal[1] = 1
    complete: Literal[True] = True
    request_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    data_kind: Literal[
        "library", "index", "screening", "definition", "decoded", "counts", "analysis", "model"
    ]
    artifacts: list[DataArtifact] = Field(min_length=1, max_length=4096)
    counts: dict[str, int] = Field(default_factory=dict, max_length=30)
    candidates: list[DataCandidate] = Field(default_factory=list, max_length=1000)
    metrics: dict[str, float] = Field(default_factory=dict, max_length=30)
    metadata: dict = Field(default_factory=dict, max_length=40)
    warnings: list[str] = Field(default_factory=list, max_length=30)
    molecule_artifact: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    scope: Literal["computed_data_not_experimental_affinity"] = (
        "computed_data_not_experimental_affinity"
    )


def validate_result(value, request, output: Path, *, full_hash=True):
    result = DatasetResult.model_validate(value)
    if (result.operation, result.program, result.request_sha256) != (
        request.operation,
        request.payload.kind,
        hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
    ):
        raise ValueError("Scientific data result differs from its exact task input versions.")
    if result.data_kind != RESULT_KINDS[request.operation]:
        raise ValueError("Native data result has a different scientific role from its task.")
    names = [item.name for item in result.artifacts]
    if len(names) != len(set(names)) or "result.json" in names:
        raise ValueError("Scientific data artifacts must have unique direct file identities.")
    if result.molecule_artifact and result.molecule_artifact not in names:
        raise ValueError("Candidate molecular files are missing from the scientific result.")
    if any(item.artifact and item.artifact not in names for item in result.candidates):
        raise ValueError("A candidate refers to an unverified molecular file.")
    if any(value < 0 for value in result.counts.values()):
        raise ValueError("Research record counts cannot be negative.")
    for item in result.artifacts:
        file = contained(output, item.name)
        if file.stat().st_size != item.size:
            raise ValueError("A scientific data artifact changed its size.")
        if full_hash:
            verified(file, item.sha256)
    if request.operation == "library_prepare":
        counts = result.counts
        if (
            counts.get("source_records")
            != counts.get("valid_records", -1) + counts.get("rejected_records", -1)
            or counts.get("valid_records")
            != counts.get("unique_compounds", -1) + counts.get("duplicate_chemical_records", -1)
            or not counts.get("unique_compounds")
        ):
            raise ValueError("Prepared-library record accounting is incomplete.")
    return result
