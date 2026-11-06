"""Bundle retained scientific prediction files without invoking a prediction or analysis."""

import hashlib
import json
import os
import re
import stat
from pathlib import Path
from tempfile import SpooledTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

from .artifacts import contained
from .integrations.boltz_result import confidence_files, validate_boltz_result
from .prediction_sample_export import (
    BOLTZ_OUTPUT,
    MAX_RESULT,
    MAX_STRUCTURE,
    bounded,
    one,
    retained_native_result,
)

MAX_FILES = 500
MAX_BYTES = 128 * 1024**2
BLOCK = 1024**2
OPEN_DDE_MODEL = re.compile(r"(.+)_sample_(\d+)\.cif")
MSA_FILES = {"pairing.a3m", "non_pairing.a3m", "hmmsearch.a3m"}


class ArchiveCancelled(Exception):
    pass


def prediction_files(root, job, request_sha256, sealed, checkpoint):
    output = root / "output"
    paths = {}
    models = set()
    limitations = []
    validated_report_sha256 = None

    def add(name, role, recorded=None):
        checkpoint()
        expected = sealed.get(name, recorded)
        if recorded and expected != recorded:
            raise ValueError("Scientific source identities disagree.")
        if name in paths and paths[name] != (role, expected):
            raise ValueError("Scientific source identity is ambiguous.")
        paths[name] = role, expected
        if len(paths) > MAX_FILES:
            raise ValueError("This prediction has too many files for one archive.")

    def optional(path, role, recorded=None):
        name = path.as_posix()
        if name in sealed or recorded is not None or (output / path).is_file():
            add(name, role, recorded)

    if job.request.operation == "predict":
        prefix = output / job.id
        analysis_file = root / "analysis/workbench-analysis.json"
        rows = []
        if analysis_file.is_file():
            analysis = json.loads(
                bounded(contained(root, "analysis/workbench-analysis.json"), MAX_RESULT)
            )
            if isinstance(analysis, dict) and analysis.get("schema_version") == 4:
                rows = analysis["candidates"]
        reports = {row["artifact"]: row for row in rows}
        names = set(reports) | {
            path.relative_to(output).as_posix()
            for path in (
                *prefix.glob("seed_*/predictions/*_sample_*.cif"),
                *output.glob(f"{job.id}_sample_*.cif"),
            )
        }
        names.update(name for name in sealed if OPEN_DDE_MODEL.fullmatch(Path(name).name))
        seeds = job.request.parameters.seeds
        for name in sorted(names):
            path = Path(name)
            match = OPEN_DDE_MODEL.fullmatch(path.name)
            nested = path.is_relative_to(job.id) and path.parent.name == "predictions"
            if match is None or not (nested or path.parent == Path(".")):
                raise ValueError("The saved structure is not an original task prediction.")
            base, sample = match.groups()
            if name not in reports and base != job.id:
                raise ValueError("The saved structure belongs to a different task.")
            row = reports.get(name, {})
            seed_dir = re.fullmatch(r"seed_(\d+)", path.parent.parent.name)
            seed = int(seed_dir[1]) if seed_dir else seeds[0] if len(seeds) == 1 else None
            models.add((seed, int(sample)))
            add(name, "structure", row.get("artifact_sha256"))
            optional(
                path.with_name(f"{base}_summary_confidence_sample_{sample}.json"),
                "confidence_summary",
                row.get("summary_sha256"),
            )
            optional(path.with_name(f"{base}_full_data_sample_{sample}.json"), "confidence_full")
        msa_roots = (prefix, output / "native")
        expected_models = {
            (seed, index) for seed in seeds for index in range(job.request.parameters.samples)
        }
        if models != expected_models or len(names) != len(expected_models):
            limitations.append(
                "The archive does not establish a complete set of requested OpenDDE samples."
            )
    else:
        result, report = retained_native_result(
            root, job.request, request_sha256, sealed.get("result.json")
        )
        validated_report_sha256 = hashlib.sha256(report).hexdigest()
        digests = set()
        for row in result.candidates:
            name = row.artifact
            if not name or Path(name).name != name or not name.endswith(".cif"):
                raise ValueError("The result has no original prediction CIF.")
            digest = result.artifact_sha256[name]
            digests.add(digest)
            add(name, "structure", digest)
            summary = Path(name).with_name(f"{Path(name).stem}-confidence.json")
            if job.request.operation == "mol1_predict":
                if result.mol1 is None:
                    raise ValueError("Retained Mol-1 sample identities are unavailable.")
                sample = one(result.mol1.samples, row.id, lambda item: item.candidate_id)
                key = f"seed-{sample.seed}-rank-{sample.rank}"
                if row.id != key or name != key + ".cif" or sample.summary_artifact != summary.name:
                    raise ValueError("Mol-1 summary belongs to another sample.")
                add(summary.name, "confidence_summary", result.artifact_sha256[summary.name])
                if sample.full_data_artifact:
                    full = sample.full_data_artifact
                    if full != key + "-full-data.json":
                        raise ValueError("Mol-1 full confidence belongs to another sample.")
                    add(full, "confidence_full", result.artifact_sha256[full])
            elif summary.name in result.artifact_sha256:
                add(summary.name, "confidence_summary", result.artifact_sha256[summary.name])
        if job.request.operation == "boltz_predict":
            validate_boltz_result(result, job.request)
            for role, name in confidence_files(result.boltz).items():
                add(
                    name,
                    "confidence_mapping" if role == "confidence_mapping" else "confidence_full",
                    result.artifact_sha256[name],
                )
            if result.boltz is None and add_boltz_native_files(
                output, digests, sealed, optional, checkpoint
            ):
                limitations.append(
                    "Raw Boltz files without recorded model and confidence checksums are omitted."
                )
        # The native report also carries task-level affinity output, separate
        # from the per-conformer metrics table.
        add("result.json", "prediction_result")
        optional(Path("structures.csv"), "metrics", result.artifact_sha256.get("structures.csv"))
        msa_roots = (output / "native",)
    for directory in msa_roots:
        base = directory.relative_to(output)
        for path in directory.rglob("*.a3m"):
            if retained_msa(path):
                add(path.relative_to(output).as_posix(), "msa")
        for name in sealed:
            path = Path(name)
            if path.is_relative_to(base) and retained_msa(path):
                add(name, "msa")
    if not any(role == "structure" for role, _ in paths.values()):
        raise FileNotFoundError("No retained original prediction structures.")
    return paths, limitations, validated_report_sha256


def retained_msa(path):
    return path.name in MSA_FILES or (
        path.parent.name == "msas" and re.fullmatch(r"msa-[a-f0-9]{64}\.a3m", path.name)
    )


def add_boltz_native_files(output, digests, sealed, optional, checkpoint):
    # Keep the native index and coordinates together with the native confidence files.
    native = output / BOLTZ_OUTPUT
    names = {path.relative_to(output).as_posix() for path in native.glob("prediction_model_*.cif")}
    names.update(name for name in sealed if Path(name).parent == BOLTZ_OUTPUT)
    omitted = False
    for name in sorted(names):
        checkpoint()
        path = Path(name)
        if not re.fullmatch(r"prediction_model_\d+\.cif", path.name):
            continue
        if name not in sealed:
            omitted = True
            continue
        source = hashlib.sha256(bounded(contained(output, name), MAX_STRUCTURE)).hexdigest()
        if sealed[name] != source or source not in digests:
            raise ValueError("The native structure differs from the archived result.")
        optional(BOLTZ_OUTPUT / path.name, "structure", source)
        sidecars = [
            (f"confidence_{path.stem}.json", "confidence_summary"),
            *((f"{field}_{path.stem}.npz", "confidence_full") for field in ("pae", "pde", "plddt")),
        ]
        for filename, role in sidecars:
            sidecar = BOLTZ_OUTPUT / filename
            if sidecar.as_posix() in sealed:
                optional(sidecar, role)
            elif (output / sidecar).is_file():
                omitted = True
    return omitted


def prediction_archive(root, job, request_sha256, sealed, cancelled=None):
    def checkpoint():
        if cancelled is not None and cancelled():
            raise ArchiveCancelled

    files, limitations, validated_report_sha256 = prediction_files(
        root, job, request_sha256, sealed, checkpoint
    )
    receipt = {
        "schema_version": 1,
        "source_job": job.id,
        "operation": job.request.operation,
        "request_sha256": request_sha256,
        "files": {},
        "limitations": limitations,
    }
    archive = SpooledTemporaryFile(max_size=4 * BLOCK, dir=root.parent.parent)
    try:
        remaining = MAX_BYTES
        with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=1) as target:
            for name, (role, expected) in sorted(files.items()):
                checkpoint()
                path = contained(root / "output", name)
                digest, size = hashlib.sha256(), 0
                with path.open("rb") as source:
                    before = os.fstat(source.fileno())
                    if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= remaining:
                        raise ValueError("The retained prediction exceeds the archive size limit.")
                    with target.open(f"outputs/{name}", "w") as member:
                        while block := source.read(BLOCK):
                            checkpoint()
                            remaining -= len(block)
                            if remaining < 0:
                                raise ValueError(
                                    "The retained prediction exceeds the archive size limit."
                                )
                            size += len(block)
                            digest.update(block)
                            member.write(block)
                    after = os.fstat(source.fileno())
                    if size != before.st_size or after.st_mtime_ns != before.st_mtime_ns:
                        raise ValueError(
                            "A prediction file changed while the archive was prepared."
                        )
                actual = digest.hexdigest()
                if name == "result.json" and actual != validated_report_sha256:
                    raise ValueError("The native report changed after it was validated.")
                if expected is not None and actual != expected:
                    raise ValueError("A prediction file differs from its recorded checksum.")
                receipt["files"][f"outputs/{name}"] = {
                    "role": role,
                    "sha256": actual,
                    "size": size,
                    "matched_recorded_checksum": expected is not None,
                }
            target.writestr("prediction.json", json.dumps(receipt, indent=2) + "\n")
        length = archive.tell()
        archive.seek(0)
        return archive, length
    except BaseException:
        archive.close()
        raise
