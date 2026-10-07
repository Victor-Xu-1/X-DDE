"""Executable environments use Linux storage; bulk assets can use mounted Windows disks."""

import hashlib
from pathlib import Path

from ..engine_registry import ENGINES


def environment_root(component_root: Path, package: str = "harness") -> Path:
    if package not in ENGINES:
        raise ValueError("Unknown scientific environment.")
    identifier = hashlib.sha256(str(component_root.resolve()).encode()).hexdigest()[:16]
    from ..integrations.specs import PROGRAMS

    if package in PROGRAMS or package == "caver":
        # Container executables live in Docker's verified Linux storage. Their reviewed
        # build contexts honor the user's managed component directory on every host.
        return component_root / "environments" / package
    return Path.home() / ".local/share/opendde-workbench/environments" / identifier / package
