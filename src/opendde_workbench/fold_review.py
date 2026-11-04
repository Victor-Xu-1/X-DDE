"""Prepare a local read-only view of exact native fold sources."""

import re
from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .harness_chains import fold_chain_groups, native_chain_sequences
from .harness_tools import asset_references

_CHAIN_FILES = {
    "unpairedMsaPath": "unpaired",
    "pairedMsaPath": "paired",
}


class FoldPlacement(BaseModel):
    """Local validation of the pinned native GPU placement envelope."""

    model_config = ConfigDict(extra="forbid")
    fold: list[int] | None = None
    esm: int | None = Field(default=None, ge=0)
    mpnn: int | None = Field(default=None, ge=0)
    cp_degree: int = Field(default=1, ge=1)

    @model_validator(mode="before")
    @classmethod
    def infer_degree(cls, value):
        if isinstance(value, Mapping) and value.get("fold") and value.get("cp_degree") is None:
            return {**value, "cp_degree": len(value["fold"])}
        return value

    @model_validator(mode="after")
    def validate_devices(self):
        devices = self.fold
        if devices is not None and (
            len(devices) != self.cp_degree
            or len(devices) != len(set(devices))
            or any(device < 0 for device in devices)
        ):
            raise ValueError("Choose distinct nonnegative GPUs matching the fold parallelism.")
        return self


class FoldEnvelope(BaseModel):
    """Browser-safe subset of Harness v0.0.4 FoldRequest."""

    model_config = ConfigDict(extra="forbid")
    candidates: list[dict[str, Any]] = Field(min_length=1, max_length=64)
    backend: Literal["opendde"] = "opendde"
    options: dict[str, Any] = Field(default_factory=dict)
    placement: FoldPlacement | None = None


def _chains(values, bindings):
    result = []
    for chain, sequence in native_chain_sequences(values).items():
        if not isinstance(sequence, str) or not re.fullmatch(r"[A-Z]+", sequence):
            raise ValueError("Use plain uppercase residue sequences without FASTA headers.")
        raw = values[chain]
        files = []
        if isinstance(raw, Mapping):
            for field, role in _CHAIN_FILES.items():
                tokens = raw.get(field) or []
                if isinstance(tokens, str):
                    tokens = [tokens]
                for token in tokens:
                    asset = bindings[token.removeprefix("asset:")]
                    files.append({"id": asset.id, "name": asset.name, "role": role})
        result.append({"chain": str(chain), "sequence": sequence, "files": files})
    return result


def review_fold(task, assets):
    try:
        FoldEnvelope.model_validate(task.payload)
    except (ValidationError, TypeError) as exc:
        raise ValueError("Check the OpenDDE backend, candidates and GPU placement.") from exc
    candidates = task.payload.get("candidates")
    options = task.payload.get("options")
    if (
        not isinstance(options, dict)
        or not isinstance(options.get("target_chains"), dict)
        or not options["target_chains"]
        or any(
            not isinstance(row.get("candidate_id"), str) or not row["candidate_id"].strip()
            for row in candidates
        )
    ):
        raise ValueError("Provide target chains and one to sixty-four named candidates.")
    if any(
        options.get(key) is not None and not isinstance(options[key], kind)
        for key, kind in (("binder_chain_options", dict), ("binder_chain_ids", list))
    ):
        raise ValueError("Invalid binder chain options.")
    identifiers = set()
    for _, identifier in asset_references(task.payload):
        identifiers.add(identifier)
        if len(identifiers) > 64:
            raise ValueError("Use at most 64 input files.")
    bindings = assets.validate_bindings(task)
    reviewed = []
    for candidate, (target, binder) in zip(
        candidates, fold_chain_groups(task.payload), strict=True
    ):
        reviewed.append(
            {
                "name": candidate["candidate_id"],
                "chains": _chains(binder, bindings),
                "replaced_target_chains": [chain for chain in target if chain in binder],
            }
        )
    return {
        "target": _chains(options["target_chains"], bindings),
        "candidates": reviewed,
        "source_files": [{"id": asset.id, "name": asset.name} for asset in bindings.values()],
    }
