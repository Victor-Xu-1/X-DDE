"""Dynamic managed-runtime identity, independent of other scientific environments."""

import json
import re
from pathlib import Path

from ..engine import command
from ..locations import read_json
from .image import labels_match, lock_digest
from .manifest import VERSION


def configuration(settings):
    config = read_json(settings.state_dir / "deployment.json")
    entries = read_json(Path(config["root"]) / "installed.json") if config else {}
    entry = entries.get("caver", {})
    image = entry.get("image", "")
    if (
        entry.get("version") != VERSION
        or entry.get("runtime_lock_sha256") != lock_digest()
        or not isinstance(image, str)
        or not re.fullmatch(r"sha256:[a-f0-9]{64}", image)
    ):
        raise ValueError("Install the channel-analysis environment in Installation & components.")
    return image


async def readiness(settings):
    result = {
        "ready": False,
        "gpu": False,
        "reason": None,
        "version": VERSION,
        "scientific_acceptance": "native_protocol_verified_broader_benchmarks_pending",
    }
    try:
        image = configuration(settings)
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
        if code or not labels_match(json.loads(output) or {}):
            raise ValueError("The channel environment differs from its reviewed native recipe.")
        result["ready"] = True
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        result["reason"] = str(exc)
    return result


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "Prepare the channel environment first.")
