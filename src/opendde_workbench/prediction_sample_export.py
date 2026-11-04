"""Export one retained prediction and its own native summary without starting analysis."""

import hashlib
import io
import json
import re
import zipfile
from itertools import islice
from pathlib import Path

from .artifacts import contained

OPERATIONS = frozenset({"predict", "boltz_predict", "mol1_predict"})
MAX_STRUCTURE = 25 * 1024**2
MAX_SUMMARY = 2 * 1024**2
MAX_RESULT = 4 * 1024**2
OPENDDE_METRICS = ("ranking_score", "ptm", "iptm", "plddt")
BOLTZ_METRICS = frozenset({"confidence_score", "ptm", "iptm", "complex_plddt"})
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


def open_dde_files(root, candidate):
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
    structure = bounded(contained(root / "output", name), MAX_STRUCTURE)
    summary = matching_summary(
        root / "output", summary_name, {key: row.get(key) for key in OPENDDE_METRICS}
    )
    return (name, structure), summary


def matching_summary(output, name, expected):
    try:
        raw = bounded(contained(output, name), MAX_SUMMARY)
    except FileNotFoundError:
        return None
    summary = json.loads(raw)
    if not isinstance(summary, dict) or any(
        summary.get(key) != value for key, value in expected.items() if value is not None
    ):
        raise ValueError("Native confidence does not match the selected sample.")
    return name, raw


def integrated_files(root, request, candidate):
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
    structure = bounded(contained(output, name), MAX_STRUCTURE)
    if hashlib.sha256(structure).hexdigest() != result.artifact_sha256[name]:
        raise ValueError("The selected native structure changed.")
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
        raw = bounded(contained(output, sidecar), MAX_SUMMARY)
        if hashlib.sha256(raw).hexdigest() != result.artifact_sha256[sidecar]:
            raise ValueError("The selected native summary changed.")
        summary = (sidecar, raw)
    else:
        summary = boltz_summary(output, row, structure)
    return (name, structure), summary


def boltz_summary(output, row, structure):
    # Historical Boltz aliases retained direct CIFs and metrics but did not
    # declare the native JSON path. Only a unique byte-identical source binds it.
    # Native Boltz produces at most ten structures per task.
    files = list(islice((output / BOLTZ_OUTPUT).glob("prediction_model_*.cif"), 11))
    if len(files) > 10:
        raise ValueError("Too many native Boltz structures to verify the selected sample.")
    matches = []
    for path in files:
        if not re.fullmatch(r"prediction_model_\d+", path.stem):
            continue
        name = path.relative_to(output).as_posix()
        if bounded(contained(output, name), MAX_STRUCTURE) == structure:
            matches.append(path)
    if len(matches) != 1:
        return None
    native = matches[0]
    name = (BOLTZ_OUTPUT / f"confidence_{native.stem}.json").as_posix()
    expected = {metric.name: metric.value for metric in row.metrics if metric.name in BOLTZ_METRICS}
    return matching_summary(output, name, expected) if expected else None


def sample_zip(root, job, candidate):
    if job.request.operation == "predict":
        structure, summary = open_dde_files(root, candidate)
    else:
        structure, summary = integrated_files(root, job.request, candidate)
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
