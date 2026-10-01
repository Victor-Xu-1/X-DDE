"""Independent environment readiness; installation is distinct from numbering acceptance."""

import json
import re

from ..engine import command
from .image import VERSION, labels_match


def configuration(settings):
    image = settings.anarcii_image
    if not image or not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
        raise ValueError("Install the ANARCII antibody environment in Installation & components.")
    return image


async def readiness(settings):
    value = {
        "ready": False,
        "reason": None,
        "version": VERSION,
        "gpu": False,
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
            raise ValueError("Antibody image is missing or differs from the reviewed recipe.")
        value["ready"] = True
    except (ValueError, OSError, RuntimeError, TimeoutError) as exc:
        value["reason"] = str(exc)
    return value


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(
            state.get("reason") or "Independent antibody environment is unavailable."
        )
    if request.constraints:
        raise ValueError("Numbering does not execute molecular constraints.")
