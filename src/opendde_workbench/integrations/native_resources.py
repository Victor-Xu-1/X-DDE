"""Shared fail-closed model-manifest checks for installation readiness and native execution."""

import hashlib
import json
from pathlib import PurePosixPath


def model_files(root, spec, *, full_hash=False):
    file = root / "manifest.json"
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Invalid native model manifest.")
    manifest = json.loads(file.read_text(encoding="utf-8"))
    recipe = hashlib.sha256(
        json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if manifest.get("recipe_sha256") != recipe or not manifest.get("files"):
        raise ValueError("Native model resources differ from the reviewed recipe.")
    entries = manifest["files"]
    if not isinstance(entries, list) or len(entries) > 200000:
        raise ValueError("Invalid native model member count.")
    by_name = {row["name"]: row for row in entries}
    if len(by_name) != len(entries):
        raise ValueError("Duplicate native model resource identities.")
    for expected in spec["models"]:
        saved = by_name.get(expected["name"])
        if not saved or (saved["sha256"], saved["size"]) != (expected["sha256"], expected["size"]):
            raise ValueError("A required official model resource is missing or changed.")
    for row in entries:
        name = PurePosixPath(row["name"])
        if name.is_absolute() or ".." in name.parts or "\\" in row["name"]:
            raise ValueError("Unsafe native resource path.")
        path = root.joinpath(*name.parts)
        if (
            path.is_symlink()
            or not path.resolve().is_relative_to(root.resolve())
            or not path.is_file()
            or path.stat().st_size != row["size"]
        ):
            raise ValueError("A selected model resource is missing or changed.")
        if full_hash:
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != row["sha256"]:
                raise ValueError("Native model resource integrity check failed.")
    return manifest
