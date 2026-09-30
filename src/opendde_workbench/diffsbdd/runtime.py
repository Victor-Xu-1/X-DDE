"""Resolve only operator-configured scientific installations, without importing Torch."""

import hashlib
import json

from .manifest import MODELS, SOURCE_COMMIT


def configuration(settings):
    python, source, root = (
        settings.diffsbdd_python,
        settings.diffsbdd_source,
        settings.diffsbdd_home,
    )
    if not all(
        value and value.is_dir() if name != "python" else value and value.is_file()
        for name, value in (("python", python), ("source", source), ("root", root))
    ):
        raise ValueError(
            "Install the DiffSBDD runtime in Installation & components, then restart X-DDE."
        )
    manifest = source / "xdde-native-manifest.json"
    if not manifest.is_file() or not settings.diffsbdd_manifest_sha256:
        raise ValueError("DiffSBDD source has no trusted installation manifest.")
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != settings.diffsbdd_manifest_sha256:
        raise ValueError("DiffSBDD installation manifest failed integrity verification.")
    data = json.loads(manifest.read_text())
    if data.get("source_commit") != SOURCE_COMMIT:
        raise ValueError("DiffSBDD source revision does not match this adapter.")
    return python, source, root


def readiness(settings):
    result = {
        "ready": False,
        "reason": None,
        "models": {},
        "source_commit": SOURCE_COMMIT,
        "scientific_acceptance": "pending_server_validation",
    }
    try:
        _, _, root = configuration(settings)
        result["ready"] = True
        for identifier, spec in MODELS.items():
            file = root / "models" / spec["file"]
            result["models"][identifier] = file.is_file() and file.stat().st_size == spec["bytes"]
    except (OSError, ValueError, KeyError) as exc:
        result["reason"] = str(exc)
    return result


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "DiffSBDD runtime is unavailable.")
    if request.payload.mode in {"generate", "inpaint", "diversify", "optimize"}:
        if not state.get("models", {}).get(request.payload.options.model):
            raise RuntimeError(
                "Install the selected DiffSBDD checkpoint in Installation & components."
            )
