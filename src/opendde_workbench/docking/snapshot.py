"""Capture only the native adapter boundary, preserving the exact bytes used by a task."""

import hashlib
from pathlib import Path

NATIVE_FILES = ("native.py", "chemistry.py", "options.py", "manifest.py")


def capture(directory: Path, source: Path):
    target = directory / "adapter"
    (target / "docking").mkdir(parents=True, exist_ok=False)
    digests = {}
    for file, relative in [(source / name, "docking/" + name) for name in NATIVE_FILES] + [
        (source.parent / "scientific_objects.py", "scientific_objects.py")
    ]:
        if file.is_symlink() or file.stat().st_size > 2 * 1024**2:
            raise ValueError("Native adapter source must be a bounded regular file.")
        content = file.read_bytes()
        output = target / relative
        output.write_bytes(content)
        output.chmod(0o444)
        digests[relative] = hashlib.sha256(content).hexdigest()
    return target, digests
