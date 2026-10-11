"""One capacity authority for writes: filesystem and its physical WSL backing volume."""

import os
import platform
import shutil
import threading
import time

from .wsl_storage import StorageUnavailable, probe

_lock = threading.Lock()
_cached = None
_expires = 0.0
_distribution = None


class StorageCapacityError(ValueError):
    pass


def available_bytes(path):
    native = shutil.disk_usage(path).free
    if platform.system() != "Linux" or (
        "microsoft" not in platform.release().lower() and not os.environ.get("WSL_DISTRO_NAME")
    ):
        return native
    distribution = os.environ.get("WSL_DISTRO_NAME", "")
    if not distribution:
        raise StorageUnavailable("Cannot identify the WSL storage location.")
    global _cached, _expires, _distribution
    with _lock:
        if _cached is None or _distribution != distribution or time.monotonic() >= _expires:
            # Never retain a successful value after a failed refresh.
            _cached = None
            _cached = probe(distribution)
            _distribution = distribution
            _expires = time.monotonic() + 1
        return min(native, _cached.free_bytes)


def require_space(path, minimum):
    if available_bytes(path) < minimum:
        raise StorageCapacityError(
            "Not enough free disk space. Free space on the storage drive and retry."
        )
