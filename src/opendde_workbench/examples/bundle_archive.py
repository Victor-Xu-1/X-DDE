"""Bounded content-addressed ZIP transfer; archive paths cannot choose filesystem targets."""

import hashlib
import json
import stat
import zipfile
from pathlib import PurePosixPath

MAX_TOTAL = 512 * 1024**2
MAX_FILE = 64 * 1024**2
MAX_MEMBERS = 5000


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
        if "manifest.json" not in names or source.getinfo("manifest.json").file_size > 16 * 1024**2:
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


def write_archive(target, manifest, paths):
    target.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        **manifest,
        "files": {
            name: {"sha256": sha256(path), "bytes": path.stat().st_size}
            for name, path in sorted(paths.items())
        },
    }
    with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, sort_keys=True))
        for name, path in sorted(paths.items()):
            archive.write(path, name)
    return {"sha256": sha256(target), "bytes": target.stat().st_size}
