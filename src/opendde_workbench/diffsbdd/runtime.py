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
        from ..local_scope import controller_environment

        controller_environment()
        result["ready"] = True
        for identifier, spec in MODELS.items():
            file = root / "models" / spec["file"]
            result["models"][identifier] = file.is_file() and file.stat().st_size == spec["bytes"]
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        result["reason"] = str(exc)
    return result


def validate(request, state):
    # Admission-only: retain readable historical requests that failed this native limit.
    if request.payload.mode == "inpaint":
        options = request.payload.options
        if options.size_mode == "fixed" and not (
            8 <= len(options.fixed_atoms) + options.added_atoms <= 80
        ):
            raise ValueError(
                "Fixed and added heavy atoms must total 8–80; adjust the core or added atoms."
            )
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "DiffSBDD runtime is unavailable.")
    if request.payload.mode in {"generate", "inpaint", "diversify", "optimize"}:
        if not state.get("models", {}).get(request.payload.options.model):
            raise RuntimeError(
                "Install the selected DiffSBDD checkpoint in Installation & components."
            )
