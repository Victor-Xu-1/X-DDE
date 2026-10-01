"""Runtime configuration/readiness is distinct from structural input validation."""

import json
import re

from ..engine import command
from .image import VERSION, labels_match


def configuration(settings):
    image = settings.biopython_image
    if not image or not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
        raise ValueError(
            "Install the Biopython structural environment in Installation & components."
        )
    return image


async def readiness(settings):
    result = {
        "ready": False,
        "reason": None,
        "version": VERSION,
        "scientific_acceptance": "pending_server_validation",
    }
    try:
        image = configuration(settings)
        code, text = await command(
            "docker",
            "image",
            "inspect",
            "--format",
            "{{json .Config.Labels}}",
            image,
            timeout=8,
            separate_stderr=True,
        )
        if code or not labels_match(json.loads(text) or {}):
            raise ValueError("Biopython image is missing or differs from the reviewed recipe.")
        result["ready"] = True
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        result["reason"] = str(exc)
    return result


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(
            state.get("reason") or "The Biopython structural environment is unavailable."
        )
    if request.constraints:
        raise ValueError(
            "Receptor alignment changes coordinates; review constraints on its resulting versions."
        )
