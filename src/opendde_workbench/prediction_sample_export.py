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
    structure = verified(
        output, name, sealed.get(name) or row.get("artifact_sha256"), MAX_STRUCTURE
    )
    digest = sealed.get(summary_name) or row.get("summary_sha256")
    summary = verified(output, summary_name, digest, MAX_SUMMARY) if digest else None
    return structure, summary


def integrated_files(root, request, candidate, sealed):
    from .integrations.result import NativeResult

    output = root / "output"
    manifest = json.loads(bounded(contained(output, "result.json"), MAX_RESULT))
    result = NativeResult.model_validate(manifest)
    if (
        result.operation != request.operation
        or result.program != request.payload.kind
        or result.request_sha256 != hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    ):
        raise ValueError("Native prediction differs from the retained task.")
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
            summary = historical_boltz_summary(output, result.artifact_sha256[name], sealed)
    return structure, summary


def historical_boltz_summary(output, structure_digest, sealed):
    # Resolve against the full sealed archive, including sources that may have
    # since disappeared. The remaining files alone cannot establish identity.
    matches = [
        path
        for name, digest in sealed.items()
        if digest == structure_digest
        and (path := Path(name)).parent == BOLTZ_OUTPUT
        and re.fullmatch(r"prediction_model_\d+\.cif", path.name)
    ]
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
