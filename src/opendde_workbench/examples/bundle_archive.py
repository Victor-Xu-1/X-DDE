"""Bounded content-addressed ZIP transfer; archive paths cannot choose filesystem targets."""

import hashlib
import json
import os
import stat
import tempfile
import zipfile
from contextlib import suppress
from pathlib import Path, PurePosixPath

# Full-cohort DEL analysis retains a ~376 MiB SQLite file and a ~222 MiB CSV.
# Transfer limits apply symmetrically; they never authorize scientific recomputation.
MAX_TOTAL = 2 * 1024**3
MAX_FILE = 512 * 1024**2
MAX_MEMBERS = 5000
MAX_MANIFEST = 16 * 1024**2


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_path(root, name):
    path = PurePosixPath(name)
    if (
        not name
        or "\\" in name
        or path.is_absolute()
        or ":" in name
        or any(part in {"..", ".", ""} for part in name.split("/"))
    ):
        raise ValueError("Unsafe case bundle path.")
    target = root.joinpath(*path.parts)
    if any(
        part.is_symlink() for part in [target, *target.parents]
    ) or not target.resolve().is_relative_to(root.resolve()):
        raise ValueError("Case files must remain inside the owned state directory.")
    return target


def read_archive(archive, staging, expected_sha):
    if len(expected_sha) != 64 or sha256(archive) != expected_sha:
        raise ValueError("The public case bundle failed its reviewed SHA-256 verification.")
    with zipfile.ZipFile(archive) as source:
        members = source.infolist()
        names = [member.filename for member in members]
        if (
            len(members) > MAX_MEMBERS
            or len(set(names)) != len(names)
            or sum(m.file_size for m in members) > MAX_TOTAL
        ):
            raise ValueError("Case bundle exceeds its bounded file/count limits or repeats a path.")
        for member in members:
            mode = member.external_attr >> 16
            if (
                member.is_dir()
                or stat.S_ISLNK(mode)
                or member.file_size > MAX_FILE
                or member.flag_bits & 1
            ):
                raise ValueError("Case bundles contain bounded regular, unencrypted files only.")
            safe_path(staging, member.filename)
        if "manifest.json" not in names or source.getinfo("manifest.json").file_size > MAX_MANIFEST:
            raise ValueError("Missing or oversized case manifest.")
        manifest = json.loads(source.read("manifest.json"))
        if manifest.get("schema_version") != 1 or set(names) != {
            "manifest.json",
            *manifest.get("files", {}),
        }:
            raise ValueError("Unexpected case manifest or archive contents.")
        for name, evidence in manifest["files"].items():
            if (
                set(evidence) != {"sha256", "bytes"}
                or evidence["bytes"] != source.getinfo(name).file_size
            ):
                raise ValueError("Case file size differs from its manifest.")
            target = safe_path(staging, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(name) as incoming, target.open("xb") as outgoing:
                while block := incoming.read(1024**2):
                    outgoing.write(block)
            if sha256(target) != evidence["sha256"]:
                raise ValueError("Case artifact failed byte-level verification.")
    return manifest


def _write_member(archive, source, name, evidence):
    """Bound a changing source while hashing the exact bytes placed in the ZIP."""
    digest, size = hashlib.sha256(), 0
    with source.open("rb") as incoming, archive.open(name, "w") as outgoing:
        while block := incoming.read(1024**2):
            size += len(block)
            if size > evidence["bytes"]:
                raise ValueError("A case source grew beyond its reviewed transfer size.")
            digest.update(block)
            outgoing.write(block)
    if size != evidence["bytes"] or digest.hexdigest() != evidence["sha256"]:
        raise ValueError("A case source changed during export; no archive was published.")


def write_archive(target, manifest, paths):
    target.parent.mkdir(parents=True, exist_ok=True)
    if len(paths) + 1 > MAX_MEMBERS or "manifest.json" in paths:
        raise ValueError("Case export exceeds its file limit or uses the reserved manifest path.")
    files, total_size = {}, 0
    for name, path in sorted(paths.items()):
        safe_path(target.parent, name)
        info = path.stat()
        if path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE:
            raise ValueError("Case exports contain bounded regular files only.")
        total_size += info.st_size
        if total_size > MAX_TOTAL:
            raise ValueError("Case export exceeds its bounded total size.")
        files[name] = {"sha256": sha256(path), "bytes": info.st_size}
    manifest = {
        **manifest,
        "files": files,
    }
    document = json.dumps(manifest, ensure_ascii=False, sort_keys=True)
    document_size = len(document.encode("utf-8"))
    if (
        document_size > MAX_MANIFEST
        or sum(row["bytes"] for row in files.values()) + document_size > MAX_TOTAL
    ):
        raise ValueError("Case export exceeds its bounded manifest or total size.")
    staging = tempfile.TemporaryDirectory(prefix=".case-bundle-", dir=target.parent)
    try:
        staged = Path(staging.name) / target.name
        with zipfile.ZipFile(
            staged, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6
        ) as archive:
            archive.writestr("manifest.json", document)
            for name, path in sorted(paths.items()):
                _write_member(archive, path, name, files[name])
        receipt = {"sha256": sha256(staged), "bytes": staged.stat().st_size}
        # A same-filesystem hard link publishes complete bytes without replacing any target.
        # Unsupported filesystems fail closed rather than weaken the no-overwrite contract.
        os.link(staged, target)
        return receipt
    finally:
        # Cleanup must neither hide the original error nor invalidate a published receipt.
        # The caller's target is never ours to remove, even if publication lost a race.
        with suppress(OSError):
            staging.cleanup()
