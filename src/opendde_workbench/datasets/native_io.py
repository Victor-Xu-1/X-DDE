"""Streaming scientific data helpers; no browser paths or arbitrary native commands."""

import csv
import gzip
import hashlib
import json
import sqlite3
from pathlib import Path


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def input_file(request, role, position=0):
    matches = [item for item in request["inputs"] if item["role"] == role]
    if not 0 <= position < len(matches):
        raise ValueError("Missing exact scientific input: " + role)
    reference = matches[position]["source"]
    bindings = json.loads(Path("/input/bindings.json").read_text())
    bound = bindings[reference["asset_id"]]
    if not bound.startswith("/job/assets/"):
        raise ValueError("Scientific data must belong to the immutable task snapshot.")
    file = Path("/input/assets") / Path(bound).name
    if file.is_symlink() or not file.is_file() or digest(file) != reference["sha256"]:
        raise ValueError("Scientific data input bytes changed.")
    return file, reference


def source_result(request, position=0):
    reference = request["sources"][position]
    root = Path("/sources") / reference["job_id"]
    manifest = root / "result.json"
    if (
        manifest.is_symlink()
        or manifest.stat().st_size > 4 * 1024**2
        or digest(manifest) != reference["report_sha256"]
    ):
        raise ValueError("Native source result differs from its confirmed version.")
    result = json.loads(manifest.read_text())
    if result["data_kind"] != reference["role"]:
        raise ValueError("Native source data has the wrong scientific role.")
    proof = Path("/input/source-integrity.json")
    evidence = json.loads(proof.read_text()).get(reference["job_id"], {}) if proof.is_file() else {}
    for artifact in result["artifacts"]:
        name = artifact["name"]
        if not name or Path(name).name != name or name in {".", ".."}:
            raise ValueError("Source result contains an unsafe artifact path.")
        file = root / name
        stat = file.stat()
        observed = [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns]
        confirmed = evidence.get(name, {})
        verified = (
            confirmed.get("sha256") == artifact["sha256"] and confirmed.get("stamp") == observed
        )
        if (
            file.is_symlink()
            or stat.st_size != artifact["size"]
            or (not verified and digest(file) != artifact["sha256"])
        ):
            raise ValueError("Source scientific artifact bytes changed.")
    return root, result


def readonly_database(path):
    database = sqlite3.connect(path.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA query_only=ON")
    database.execute("PRAGMA trusted_schema=OFF")
    return database


def verify_models():
    from native_resources import model_files

    recipe = json.loads(Path("/platform/recipes.json").read_text())["programs"]["drugclip"]
    root = Path("/models")
    manifest = model_files(root, recipe)
    proof = Path("/input/model-integrity.json")
    evidence = json.loads(proof.read_text()) if proof.is_file() else {}
    for row in manifest["files"]:
        file = root / row["name"]
        stat = file.stat()
        stamp = [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns]
        entry = evidence.get(row["name"], {})
        if entry.get("sha256") != row["sha256"] or entry.get("stamp") != stamp:
            if digest(file) != row["sha256"]:
                raise ValueError(
                    "The selected official DrugCLIP model changed before native execution."
                )


def text_lines(path, expanded_bytes, maximum_line=1024**2):
    opener = gzip.open if path.name.endswith(".gz") else open
    total = 0
    with opener(path, "rt", encoding="utf-8-sig", newline="") as stream:
        while line := stream.readline(maximum_line + 1):
            if len(line) > maximum_line or "\x00" in line:
                raise ValueError("Scientific data contains an excessive or invalid text record.")
            total += len(line.encode("utf-8"))
            if total > expanded_bytes:
                raise ValueError("Expanded scientific data exceeds the selected byte budget.")
            yield line


def write_csv(path, columns, rows):
    def safe(value):
        if value is None:
            return ""
        if isinstance(value, (int, float)):
            return value
        text = str(value)
        return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text

    with Path(path).open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(columns)
        writer.writerows([[safe(value) for value in row] for row in rows])


def progress(stage, completed, total=None):
    output = Path("/output/progress.json")
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps({"stage": stage, "completed": completed, "total": total}))
    temporary.replace(output)


def finish(request, version, data_kind, artifacts, **values):
    formats = {
        ".sqlite": "sqlite",
        ".h5": "hdf5",
        ".csv": "csv",
        ".json": "json",
        ".sdf": "sdf",
        ".ndjson": "ndjson",
        ".pkl": "model",
    }
    entries = []
    for name, role in artifacts.items():
        if Path(name).name != name:
            raise ValueError("Data artifact names must be direct managed files.")
        file = Path("/output") / name
        if file.is_symlink() or not file.is_file() or not file.stat().st_size:
            raise ValueError("Native data computation produced an invalid scientific artifact.")
        entries.append(
            {
                "name": name,
                "role": role,
                "format": formats[file.suffix],
                "size": file.stat().st_size,
                "sha256": digest(file),
            }
        )
    result = {
        "operation": request["operation"],
        "program": request["payload"]["kind"],
        "version": version,
        "schema_version": 1,
        "complete": True,
        "request_sha256": digest("/input/request.json"),
        "data_kind": data_kind,
        "artifacts": entries,
        "scope": "computed_data_not_experimental_affinity",
        **values,
    }
    temporary = Path("/output/result.json.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(Path("/output/result.json"))
