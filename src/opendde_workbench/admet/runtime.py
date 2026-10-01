"""Configuration readiness never implies prospective molecular model validation."""

import json
import re

from ..engine import command
from .image import VERSION, labels_match


def configuration(settings):
    image = settings.admet_image
    if not image or not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
        raise ValueError("Install ADMET-AI in Installation & components.")
    return image


async def readiness(settings):
    state = {
        "ready": False,
        "gpu": False,
        "version": VERSION,
        "reason": None,
        "scientific_acceptance": "pending_server_validation",
    }
    try:
        code, text = await command(
            "docker",
            "image",
            "inspect",
            "--format",
            "{{json .Config.Labels}}",
            configuration(settings),
            timeout=8,
            separate_stderr=True,
        )
        if code or not labels_match(json.loads(text) or {}):
            raise ValueError("The ADMET image is missing or differs from the reviewed recipe.")
        state["ready"] = True
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        state["reason"] = str(exc)
    return state


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "The ADMET environment is unavailable.")
    if request.constraints:
        raise ValueError("ADMET predictions do not execute molecular constraints.")
