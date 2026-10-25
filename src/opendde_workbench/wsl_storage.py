"""Read only the registered distribution's physical Windows volume; never start WSL."""

import base64
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from . import wsl_storage_identity as identity
from .wsl_mount import host_mount


class StorageUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class BackingVolume:
    location: str
    free_bytes: int


def probe(distribution: str) -> BackingVolume:
    if not distribution or len(distribution) > 256 or any(ord(c) < 32 for c in distribution):
        raise StorageUnavailable("Cannot identify the WSL storage location.")
    try:
        bound = identity.load(distribution)
        if bound is not None:
            location, mount = bound
            free = shutil.disk_usage(mount).free
            if type(free) is not int or not 0 <= free <= 2**63 - 1:
                raise ValueError("Invalid live host filesystem capacity.")
            return BackingVolume(location, free)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise StorageUnavailable("Cannot verify the registered host storage identity.") from exc
    executable = shutil.which("powershell.exe")
    if not executable:
        raise StorageUnavailable("Cannot verify free space on the host disk.")
    name = base64.b64encode(json.dumps(distribution).encode()).decode()
    script = Path(__file__).with_suffix(".ps1").read_text(encoding="utf-8")
    script = script.replace("__DISTRIBUTION__", name)
    encoded = base64.b64encode(script.encode("utf-16-le")).decode()
    try:
        result = subprocess.run(
            [executable, "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
            capture_output=True,
            timeout=8,
            check=False,
        )
        if result.returncode or len(result.stdout) > 8192:
            raise ValueError("Backing-volume lookup failed.")
        value = json.loads(result.stdout.decode("utf-8-sig"))
        free, location = value["free_bytes"], value["location"]
        if type(free) is not int or not 0 <= free <= 2**63 - 1:
            raise ValueError("Invalid physical free-space value.")
        if not isinstance(location, str) or not 1 <= len(location) <= 80:
            raise ValueError("Invalid physical storage label.")
        if identity.cache_path() is not None and host_mount(location) is not None:
            identity.save(value, distribution)
        return BackingVolume(location, free)
    except (OSError, subprocess.TimeoutExpired, ValueError, KeyError, UnicodeError) as exc:
        raise StorageUnavailable("Cannot verify free space on the host disk.") from exc
