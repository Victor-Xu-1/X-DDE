"""Reviewed immutable native recipes; one catalogue feeds install, execution and display."""

import hashlib
import json
from pathlib import Path
from types import MappingProxyType


def recipes():
    value = json.loads(Path(__file__).with_name("recipes.json").read_text())
    if value.get("schema_version") != 1:
        raise ValueError("Unsupported scientific environment recipe version.")
    return value["programs"]


def recipe_digest(identifier):
    value = PROGRAMS[identifier]
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


PROGRAMS = MappingProxyType(recipes())
