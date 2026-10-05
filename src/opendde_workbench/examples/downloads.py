"""Fixed transport locations for unchanged, source-attributed scientific inputs."""

import json
from pathlib import Path

from .contracts import SourceFile

DOWNLOADS = json.loads(Path(__file__).with_name("immutable-downloads.json").read_text())
PREFIX = "https://github.com/Victor-Xu-1/X-DDE/releases/download/examples-inputs-v1/"


def download_url(spec: SourceFile) -> str:
    url = DOWNLOADS.get(spec.sha256)
    if url is None:
        return spec.url
    if url != PREFIX + spec.sha256 + Path(spec.name).suffix:
        raise ValueError("The fixed public input archive address is not reviewed.")
    return url
