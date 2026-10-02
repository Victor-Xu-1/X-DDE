"""Content-addressed public inputs, bounded and verified before scientific registration."""

import hashlib
import os
import urllib.request
from pathlib import Path
from uuid import uuid4

from .contracts import SourceFile


def verified_file(root: Path, spec: SourceFile) -> bytes:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.is_symlink():
        raise ValueError("Example cache must be an owned directory.")
    target = root / spec.sha256
    if target.is_symlink():
        raise ValueError("Example cache files cannot be symbolic links.")
    if target.exists():
        with target.open("rb") as stream:
            data = stream.read(spec.bytes + 1)
    else:
        request = urllib.request.Request(
            spec.url, headers={"User-Agent": "X-DDE research examples"}
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError("Public archive did not return the pinned scientific input.")
            data = response.read(spec.bytes + 1)
    if len(data) != spec.bytes or hashlib.sha256(data).hexdigest() != spec.sha256:
        raise ValueError("Public example bytes changed; review and publish a new example revision.")
    if not target.exists():
        temporary = root / (spec.sha256 + "." + str(uuid4()) + ".part")
        try:
            with temporary.open("xb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return data
