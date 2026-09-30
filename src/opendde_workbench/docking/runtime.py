"""Independent immutable image configuration; native execution verifies its executable."""

import re

from .image import lock_digest
from .manifest import BINARY_SHA256, VERSION


def configuration(settings):
    image = settings.gnina_image
    if not image or not re.fullmatch(r"(?:[a-zA-Z0-9./:_-]+@)?sha256:[a-f0-9]{64}", image):
        raise ValueError(
            "Install GNINA in component management or configure its immutable image ID."
        )
    return image


def validate(request, state):
    if not state.get("ready"):
        raise RuntimeError(state.get("reason") or "GNINA runtime is unavailable.")
    if request.options.use_gpu and not state.get("gpu_runtime"):
        raise RuntimeError("GPU docking requires the server NVIDIA container runtime.")


def labels_match(labels):
    return (
        labels.get("org.xdde.gnina.version") == VERSION
        and labels.get("org.xdde.gnina.sha256") == BINARY_SHA256
        and labels.get("org.xdde.gnina.runtime-lock") == lock_digest()
    )
