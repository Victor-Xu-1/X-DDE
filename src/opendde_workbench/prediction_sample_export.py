"""Export one retained prediction and its own native summary without starting analysis."""

import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

from .artifacts import contained

OPERATIONS = frozenset({"predict", "boltz_predict", "mol1_predict"})
MAX_STRUCTURE = 25 * 1024**2
MAX_SUMMARY = 2 * 1024**2
MAX_RESULT = 4 * 1024**2
BOLTZ_OUTPUT = Path("native/boltz_results_prediction/predictions/prediction")


class UnsealedPredictionSource(ValueError):
    """Legacy analysis without a source-file checksum."""


def bounded(path, limit):
    with path.open("rb") as source:
        data = source.read(limit + 1)
    if not 0 < len(data) <= limit:
        raise ValueError("Retained file is empty or exceeds the export limit.")
    return data


def one(rows, candidate, key):
    matches = [row for row in rows if key(row) == candidate]
    if len(matches) != 1:
        raise FileNotFoundError(candidate)
    return matches[0]


def verified(output, name, digest, limit):
    if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("The selected file has no retained source checksum.")
    raw = bounded(contained(output, name), limit)
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("The selected source file changed after it was recorded.")
    return name, raw


def open_dde_files(root, candidate, sealed):
    # The retained display analysis is the same candidate authority as the UI.
    # Never call the container-backed AnalysisService on this download path.
    analysis = json.loads(bounded(contained(root, "analysis/workbench-analysis.json"), MAX_RESULT))
    if not isinstance(analysis, dict) or analysis.get("schema_version") != 4:
        raise ValueError("Retained candidate identities are unavailable.")
    row = one(analysis["candidates"], candidate, lambda value: value["id"])
    name = row["artifact"]
    path = Path(name)
    match = re.fullmatch(r"(.+)_sample_(\d+)\.cif", path.name)
    if not match:
        raise ValueError("Choose an original prediction CIF.")
    summary_name = path.with_name(
        f"{match[1]}_summary_confidence_sample_{match[2]}.json"
    ).as_posix()
    output = root / "output"
    digest = sealed.get(name, row.get("artifact_sha256"))
    if digest is None:
        contained(output, name)
        raise UnsealedPredictionSource("The legacy prediction has no retained source checksum.")
    structure = verified(output, name, digest, MAX_STRUCTURE)
    digest = sealed.get(summary_name, row.get("summary_sha256"))
    summary = verified(output, summary_name, digest, MAX_SUMMARY) if digest is not None else None
    return structure, summary


def retained_native_result(root, request, request_sha256=None, result_sha256=None):
    from .integrations.result import NativeResult

    output = root / "output"
    _, source = (
        verified(output, "result.json", result_sha256, MAX_RESULT)
        if result_sha256 is not None
        else ("result.json", bounded(contained(output, "result.json"), MAX_RESULT))
    )
    manifest = json.loads(source)
    result = NativeResult.model_validate(manifest)
    if (
        result.operation != request.operation
        or result.program != request.payload.kind
        or result.request_sha256
        != (request_sha256 or hashlib.sha256(request.model_dump_json().encode()).hexdigest())
    ):
        raise ValueError("Native prediction differs from the retained task.")
    return result, source


def integrated_files(root, request, candidate, sealed):
    output = root / "output"
    result, _ = retained_native_result(root, request)
    row = one(result.candidates, candidate, lambda value: value.id)
    if not row.artifact or not row.artifact.endswith(".cif"):
        raise ValueError("Choose an original prediction CIF.")
    name = row.artifact
    structure = verified(output, name, result.artifact_sha256.get(name), MAX_STRUCTURE)
    if request.operation == "mol1_predict":
        if result.mol1 is None:
            raise ValueError("Retained Mol-1 sample identity is unavailable.")
        sample = one(result.mol1.samples, candidate, lambda value: value.candidate_id)
        key = f"seed-{sample.seed}-rank-{sample.rank}"
        if (
            candidate != key
            or name != key + ".cif"
            or sample.summary_artifact != key + "-confidence.json"
        ):
            raise ValueError("Mol-1 summary belongs to another native sample.")
        sidecar = sample.summary_artifact
        summary = verified(output, sidecar, result.artifact_sha256.get(sidecar), MAX_SUMMARY)
    else:
        sidecar = f"{Path(name).stem}-confidence.json"
        if sidecar in result.artifact_sha256:
            summary = verified(output, sidecar, result.artifact_sha256[sidecar], MAX_SUMMARY)
        else:
            summary = historical_boltz_summary(
                output, result.artifact_sha256[name], sealed, request.payload.samples
            )
    return structure, summary


def historical_boltz_summary(output, structure_digest, sealed, sample_count):
    # The complete original seed's sealed identities are required, including
    # any files that may since have disappeared from the directory.
    native_files = {
        path: digest
        for name, digest in sealed.items()
        if (path := Path(name)).parent == BOLTZ_OUTPUT
        and re.fullmatch(r"prediction_model_\d+\.cif", path.name)
    }
    expected = {BOLTZ_OUTPUT / f"prediction_model_{index}.cif" for index in range(sample_count)}
    if set(native_files) != expected:
        return None
    matches = [path for path, digest in native_files.items() if digest == structure_digest]
    if len(matches) != 1:
        return None
    native = matches[0]
    summary = (BOLTZ_OUTPUT / f"confidence_{native.stem}.json").as_posix()
    if summary not in sealed:
        return None
    try:
        verified(output, native.as_posix(), structure_digest, MAX_STRUCTURE)
        return verified(output, summary, sealed[summary], MAX_SUMMARY)
    except FileNotFoundError:
        return None


def sample_zip(root, job, candidate, sealed=None):
    sealed = sealed or {}
    if job.request.operation == "predict":
        structure, summary = open_dde_files(root, candidate, sealed)
    else:
        structure, summary = integrated_files(root, job.request, candidate, sealed)
    files = {"structure": structure}
    if summary:
        files["confidence_summary"] = summary
    if job.request.operation == "boltz_predict":
        from .integrations.boltz_result import confidence_files, validate_boltz_result

        result, _ = retained_native_result(root, job.request)
        validate_boltz_result(result, job.request)
        for role, name in confidence_files(result.boltz, candidate).items():
            remaining = 128 * 1024**2 - sum(len(body) for _, body in files.values())
            if remaining <= 0:
                raise ValueError("Selected prediction sources exceed their combined export limit.")
            files[role] = verified(
                root / "output", name, result.artifact_sha256[name], min(64 * 1024**2, remaining)
            )
    manifest = {
        "schema_version": 1,
        "source_job": job.id,
        "operation": job.request.operation,
        "candidate": candidate,
        "files": {},
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
        for role, (source, data) in files.items():
            member = f"{role}/{Path(source).name}"
            archive.writestr(member, data)
            manifest["files"][role] = {
                "member": member,
                "source_artifact": source,
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        archive.writestr("sample.json", json.dumps(manifest, indent=2) + "\n")
    return buffer.getvalue()
