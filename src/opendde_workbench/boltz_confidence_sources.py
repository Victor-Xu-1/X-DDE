"""Resolve one native Boltz sample, with recorded and current-file provenance distinct."""

import hashlib
import os
import re

from .artifacts import contained
from .integrations.boltz_result import validate_boltz_result
from .prediction_sample_export import (
    BOLTZ_OUTPUT,
    MAX_STRUCTURE,
    bounded,
    one,
    retained_native_result,
    verified,
)

MAX_ARRAY = 64 * 1024**2
PROCESSED = "native/boltz_results_prediction/processed/structures/prediction.npz"


def boltz_sources(root, request, candidate, request_sha256, sealed=None):
    sealed = sealed or {}
    result, _ = retained_native_result(root, request, request_sha256, sealed.get("result.json"))
    if any(
        name in sealed and sealed[name] != digest for name, digest in result.artifact_sha256.items()
    ):
        raise ValueError("Native confidence file identities conflict with the fixed example.")
    validate_boltz_result(result, request)
    if result.program != "boltz" or result.version != "2.2.1":
        raise ValueError("Confidence inspection is unsupported for this native writer version.")
    row = one(result.candidates, candidate, lambda value: value.id)
    if not row.artifact or not re.fullmatch(r"structure-\d{3}\.cif", row.artifact):
        raise ValueError("Choose an original Boltz prediction.")
    output = root / "output"
    digest = result.artifact_sha256.get(row.artifact)
    _, structure = verified(output, row.artifact, digest, MAX_STRUCTURE)
    recorded = result.artifact_sha256
    if result.boltz is not None:
        sample = one(result.boltz.samples, candidate, lambda value: value.candidate_id)
        names = {
            field: name
            for field in ("pae", "pde", "plddt")
            if (name := getattr(sample, field + "_artifact")) is not None
        }
        if result.boltz.mapping_artifact:
            names["mapping"] = result.boltz.mapping_artifact
        # A declared source never falls back to unrecorded sidecars.
    else:
        native_names = [
            (BOLTZ_OUTPUT / f"prediction_model_{index}.cif").as_posix()
            for index in range(request.payload.samples)
        ]
        native = output / BOLTZ_OUTPUT
        if not native.resolve().is_relative_to(output.resolve()):
            raise ValueError("Native Boltz sources escape the task output.")
        present = set()
        with os.scandir(native) as entries:
            for index, entry in enumerate(entries):
                if index >= 64:
                    raise ValueError("Native Boltz file inventory exceeds its read limit.")
                if entry.name.startswith("prediction_model_") and entry.name.endswith(".cif"):
                    present.add((BOLTZ_OUTPUT / entry.name).as_posix())
        if present != set(native_names):
            raise FileNotFoundError("The original Boltz sample inventory is incomplete.")
        matches = [
            name
            for name in native_names
            if hashlib.sha256(bounded(contained(output, name), MAX_STRUCTURE)).hexdigest() == digest
        ]
        if len(matches) != 1:
            raise ValueError("The selected Boltz sample cannot be identified unambiguously.")
        stem = matches[0].rsplit("/", 1)[1].removesuffix(".cif")
        names = {
            field: (BOLTZ_OUTPUT / f"{field}_{stem}.npz").as_posix()
            for field in ("pae", "pde", "plddt")
            if (output / BOLTZ_OUTPUT / f"{field}_{stem}.npz").exists()
        }
        if (output / PROCESSED).exists():
            names["mapping"] = PROCESSED
        recorded = sealed
    sources, hashes = {}, {}
    for field, name in names.items():
        limit = min(MAX_ARRAY, 128 * 1024**2 - sum(map(len, sources.values())))
        if limit <= 0:
            raise ValueError("Native confidence sources exceed their combined read limit.")
        expected = recorded.get(name)
        raw = (
            verified(output, name, expected, limit)[1]
            if expected is not None
            else bounded(contained(output, name), limit)
        )
        sources[field] = raw
        hashes[field] = hashlib.sha256(raw).hexdigest()
    if sum(map(len, sources.values())) > 128 * 1024**2:
        raise ValueError("Native confidence sources exceed their combined read limit.")
    return {
        "structure_artifact": row.artifact,
        "structure_sha256": hashlib.sha256(structure).hexdigest(),
        "names": names,
        "bytes": sources,
        "hashes": hashes,
        "source_integrity": (
            "recorded"
            if names and all(name in recorded for name in names.values())
            else "current_files"
        ),
    }
