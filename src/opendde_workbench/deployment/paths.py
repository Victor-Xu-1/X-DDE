"""Executable environments use Linux storage; bulk assets can use mounted Windows disks."""

import hashlib
from pathlib import Path

from ..engine_registry import ENGINES


def environment_root(component_root: Path, package: str = "harness") -> Path:
    if package not in ENGINES:
        raise ValueError("Unknown scientific environment.")
    identifier = hashlib.sha256(str(component_root.resolve()).encode()).hexdigest()[:16]
    return Path.home() / ".local/share/opendde-workbench/environments" / identifier / package
