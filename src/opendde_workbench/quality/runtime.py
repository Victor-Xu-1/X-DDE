"""Configuration readiness is separate from native scientific acceptance."""

import json
import re

from ..engine import command
from .image import VERSION, labels_match


def configuration(settings):
    image = settings.posebusters_image
    if not image or not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
        raise ValueError(
            "Install the independent PoseBusters environment in Installation & components."
        )
    return image


async def readiness(settings):
    value = {
        "ready": False,
        "gpu": False,
        "version": VERSION,
        "reason": None,
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
            raise ValueError("Quality image is missing or differs from the reviewed recipe.")
        value["ready"] = True
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        value["reason"] = str(exc)
    return value


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(
            state.get("reason") or "Independent pose-quality environment is unavailable."
        )
    if request.constraints:
        raise ValueError("Quality assessment does not execute molecular constraints.")
