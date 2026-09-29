"""Custom checkpoint names resolve only through an operator-owned registry."""

import json
import re
from pathlib import Path


def registered(settings):
    if settings.checkpoints_file is None:
        return {}
    if settings.checkpoints_file.stat().st_size > 65536:
        raise ValueError("Checkpoint registry exceeds64KiB.")
    data = json.loads(settings.checkpoints_file.read_text())
    if not isinstance(data, dict) or len(data) > 50:
        raise ValueError("Checkpoint registry must map at most50 IDs to filenames.")
    result = {}
    root = (settings.model_dir / "checkpoint").resolve()
    for identifier, filename in data.items():
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", identifier) or not isinstance(filename, str):
            raise ValueError("Invalid checkpoint registry entry.")
        path = root / filename
        if (
            Path(filename).name != filename
            or path.suffix != ".pt"
            or path.is_symlink()
            or not path.resolve().is_relative_to(root)
        ):
            raise ValueError(
                "Registered checkpoints must be .pt files inside the model checkpoint directory."
            )
        result[identifier] = path
    return result


def resolve(settings, identifier):
    path = registered(settings).get(identifier)
    if path is None or not path.is_file():
        raise ValueError("Selected custom checkpoint is not installed in the server registry.")
    return "/opendde/checkpoint/" + path.name
