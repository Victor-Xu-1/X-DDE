"""Executable environments use Linux storage; bulk assets can use mounted Windows disks."""

import hashlib
from pathlib import Path


def environment_root(component_root: Path) -> Path:
    identifier = hashlib.sha256(str(component_root.resolve()).encode()).hexdigest()[:16]
    return Path.home() / ".local/share/opendde-workbench/environments" / identifier / "harness"
