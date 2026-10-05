"""Installation/model readiness is independent for every scientific program."""

import json
from pathlib import Path

from ..engine import command
from ..locations import read_json
from .specs import PROGRAMS, recipe_digest


def entries(settings, identifier):
    config = read_json(settings.state_dir / "deployment.json")
    installed = read_json(Path(config["root"]) / "installed.json") if config else {}
    return installed.get(identifier, {}), installed.get(identifier + "-models", {})


def configuration(settings, identifier):
    runtime, models = entries(settings, identifier)
    if runtime.get("version") != PROGRAMS[identifier]["version"] or runtime.get(
        "recipe_sha256"
    ) != recipe_digest(identifier):
        raise RuntimeError("Install or upgrade the selected scientific environment in Components.")
    image = runtime.get("image")
    if not isinstance(image, str) or not image.startswith("sha256:") or len(image) != 71:
        raise RuntimeError("The native environment lacks an immutable verified image identity.")
    return image, models


async def readiness(settings, identifier):
    spec = PROGRAMS[identifier]
    value = {
        "ready": False,
        "gpu": spec["gpu"],
        "version": spec["version"],
        "reason": None,
        "scientific_acceptance": "pending_server_validation",
    }
    try:
        image, models = configuration(settings, identifier)
        code, output = await command(
            "docker",
            "image",
            "inspect",
            "--format",
            "{{json .Config.Labels}}",
            image,
            timeout=8,
            separate_stderr=True,
        )
        labels = json.loads(output) if not code else {}
        if labels.get("org.xdde.science.program") != identifier or labels.get(
            "org.xdde.science.recipe"
        ) != recipe_digest(identifier):
            raise RuntimeError("The installed scientific image differs from its reviewed recipe.")
        if spec["models"]:
            root = Path(models.get("models", ""))
            manifest = root / "manifest.json"
            if (
                not root.is_absolute()
                or root.is_symlink()
                or not manifest.is_file()
                or manifest.is_symlink()
            ):
                raise RuntimeError("Install the selected program's model resources in Components.")
            from .native_resources import model_files

            model_files(root, spec)
            if models.get("manifest_sha256") != _digest(manifest):
                raise RuntimeError("Native model manifest differs from its installed identity.")
        value["ready"] = True
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        value["reason"] = str(exc)
    return value


def _digest(file):
    import hashlib

    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "Prepare this scientific environment first.")
