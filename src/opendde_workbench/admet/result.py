"""Typed endpoint coverage and exact raw records are checked before indexing predictions."""

import hashlib
from typing import Annotated, Literal

from pydantic import Field, FiniteFloat, model_validator

from ..artifacts import contained
from ..chemistry.screen_contract import LibraryRef
from ..chemistry.sdf_io import split_records
from ..scientific_objects import MoleculeRef, ScientificModel
from .manifest import (
    CLASSIFICATION,
    ENDPOINTS,
    LEGACY_VERSIONS,
    MAX_INPUT_BYTES,
    METADATA,
    METADATA_DIGEST,
    VERSIONS,
)
from .options import AdmetOptions
from .serialization import rows_csv


class ModelIdentity(ScientificModel):
    git_blob_sha1: str = Field(pattern=r"^[a-f0-9]{40}$")
    size: int = Field(ge=1, le=2 * 1024**2)


class PredictionRow(ScientificModel):
    record: int = Field(ge=0, le=499)
    source_record_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    name: str = Field(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f\x7f]+$")
    smiles: str | None = Field(default=None, max_length=5000)
    duplicate_of_record: int | None = Field(default=None, ge=0, le=499)
    status: Literal["predicted", "failed"]
    preview: str | None = Field(default=None, max_length=80)
    reason: (
        Literal[
            "invalid_sdf_record",
            "heavy_atom_limit",
            "disconnected_components_require_preparation",
            "unsupported_model_representation",
            "native_prediction_unavailable",
        ]
        | None
    )
    predictions: dict[str, Annotated[FiniteFloat, Field(strict=True)]] = Field(max_length=41)

    @model_validator(mode="after")
    def coverage(self):
        if self.status == "predicted":
            if (
                not self.smiles
                or self.reason is not None
                or set(self.predictions) != set(ENDPOINTS)
                or any(not 0 <= self.predictions[key] <= 1 for key in CLASSIFICATION)
            ):
                raise ValueError(
                    "Native prediction identity, ranges or endpoint coverage are inconsistent."
                )
        elif self.reason is None or self.predictions:
            raise ValueError(
                "Unavailable predictions must retain a reason and no fabricated values."
            )
        if self.status == "failed" and (self.reason == "native_prediction_unavailable") != bool(
            self.smiles
        ):
            raise ValueError("Native prediction failures and input failures must remain distinct.")
        if not self.smiles and self.duplicate_of_record is not None:
            raise ValueError("An invalid input cannot claim a duplicate model representation.")
        if self.smiles and (any(char.isspace() for char in self.smiles) or "\x00" in self.smiles):
            raise ValueError("The model representation contains invalid characters.")
        return self


class AdmetResult(ScientificModel):
    operation: Literal["admet_predict"]
    schema_version: Literal[1]
    complete: Literal[True]
    source: LibraryRef | MoleculeRef
    source_kind: Literal["molecule", "library"]
    options: AdmetOptions
    versions: dict[str, str]
    endpoint_metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    model_weights: dict[str, ModelIdentity] = Field(min_length=10, max_length=10)
    models_executed: bool
    rows: tuple[PredictionRow, ...] = Field(min_length=1, max_length=50)
    predicted_count: int = Field(ge=0, le=50)
    classification: Literal["complete", "partial", "empty"]
    csv_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    previews_sha256: dict[str, str] = Field(max_length=50)
    scope: Literal["native_model_predictions_not_measurements_or_clinical_decisions"]
    drugbank_reference: Literal["disabled"]
    applicability_domain: Literal["not_established"]
    uncertainty: Literal["not_provided_by_native_api"]

    @model_validator(mode="after")
    def evidence(self):
        if (
            self.versions not in (VERSIONS, LEGACY_VERSIONS)
            or self.endpoint_metadata_sha256 != METADATA_DIGEST
            or {key: row.model_dump() for key, row in self.model_weights.items()}
            != METADATA["weights"]
        ):
            raise ValueError("Native model, dependencies or endpoint definitions have changed.")
        count = sum(row.status == "predicted" for row in self.rows)
        expected = "complete" if count == len(self.rows) else "partial" if count else "empty"
        if (
            self.predicted_count != count
            or self.classification != expected
            or self.models_executed != any(row.smiles is not None for row in self.rows)
        ):
            raise ValueError("Prediction coverage or execution state is inconsistent.")
        seen = {}
        for row in self.rows:
            if row.smiles:
                original = seen.get(row.smiles)
                if row.duplicate_of_record != (original.record if original else None):
                    raise ValueError(
                        "Duplicate molecular records must preserve their original identities."
                    )
                if original and row.predictions != original.predictions:
                    raise ValueError(
                        "An identical model representation has inconsistent predictions."
                    )
                seen.setdefault(row.smiles, row)
        return self


def validate_admet(value, task, output):
    result = AdmetResult.model_validate(value)
    kind = "molecule" if task.molecule else "library"
    if result.source != task.source or result.source_kind != kind or result.options != task.options:
        raise ValueError("ADMET result differs from the exact selected input or options.")
    source = contained(output.parent / "assets", str(task.source.asset_id) + ".sdf")
    if source.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("The prediction source exceeds its input limit.")
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != task.source.sha256:
        raise ValueError("Original prediction input bytes changed.")
    blocks = split_records(raw)
    records = [task.molecule.record] if task.molecule else list(range(len(blocks)))
    if (
        len(records) > 50
        or any(not 0 <= index < len(blocks) for index in records)
        or [row.record for row in result.rows] != records
    ):
        raise ValueError("Native predictions dropped, reordered or invented raw SDF records.")
    for row in result.rows:
        if row.source_record_sha256 != hashlib.sha256(blocks[row.record]).hexdigest():
            raise ValueError("Native predictions differ from the original molecular record bytes.")
        expected_name = f"source-record-{row.record + 1}.sdf" if row.smiles else None
        if row.preview != expected_name:
            raise ValueError("Native preview changed the selected source record identity.")
        if expected_name:
            content = blocks[row.record] + b"\n$$$$\n"
            preview = contained(output, expected_name)
            if (
                preview.stat().st_size > MAX_INPUT_BYTES
                or preview.read_bytes() != content
                or result.previews_sha256.get(expected_name) != hashlib.sha256(content).hexdigest()
            ):
                raise ValueError("Native preview changed the original molecular record bytes.")
    if set(result.previews_sha256) != {row.preview for row in result.rows if row.preview}:
        raise ValueError("Unexpected native preview artifact identity.")
    expected = rows_csv([row.model_dump() for row in result.rows], ENDPOINTS)
    table = contained(output, "predictions.csv")
    if (
        table.stat().st_size > 2 * 1024**2
        or table.read_bytes() != expected
        or hashlib.sha256(expected).hexdigest() != result.csv_sha256
    ):
        raise ValueError("Prediction table differs from the validated native report.")
    return result
