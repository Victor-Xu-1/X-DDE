"""Configuration checks do not invoke the protein-site prediction model."""

import hashlib
import json

from .manifest import JAVA_IMAGE, SHA256, VERSION


def configuration(settings):
    root = settings.p2rank_home
    if not root or not root.is_dir() or not settings.p2rank_manifest_sha256:
        raise ValueError(
            "Install P2Rank and its CPU Java environment in Installation & components."
        )
    manifest = root / "xdde-native-manifest.json"
    if (
        not manifest.is_file()
        or hashlib.sha256(manifest.read_bytes()).hexdigest() != settings.p2rank_manifest_sha256
    ):
        raise ValueError("P2Rank installation manifest failed integrity verification.")
    data = json.loads(manifest.read_text())
    if data.get("version") != VERSION or data.get("release_sha256") != SHA256:
        raise ValueError("P2Rank release does not match the reviewed adapter.")
    if settings.p2rank_image != JAVA_IMAGE:
        raise ValueError("Configure the reviewed digest-pinned P2Rank Java image.")
    if not (root / "bin/p2rank.jar").is_file():
        raise ValueError("P2Rank scientific distribution is incomplete.")
    return root, data


def verify_files(root, data):
    if not isinstance(data.get("files"), dict) or not 1 <= len(data["files"]) <= 30000:
        raise ValueError("P2Rank source manifest is invalid.")
    for name, digest in data["files"].items():
        file = root / name
        if (
            file.is_symlink()
            or not file.resolve().is_relative_to(root.resolve())
            or not file.is_file()
        ):
            raise ValueError("P2Rank source escapes its owned installation.")
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                raise ValueError("P2Rank scientific files changed since installation.")


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "P2Rank environment is not available.")
