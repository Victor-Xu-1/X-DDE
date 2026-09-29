"""Atomic shared-input publication for native Harness file consumers."""

import hashlib
import shutil
from pathlib import Path
from uuid import uuid4


def publish_shared(
    source: Path, namespace: str, host_root: Path, remote_root: str, expected_sha: str | None = None
) -> str:
    root = host_root.resolve()
    if Path(namespace).name != namespace or not namespace or source.is_symlink():
        raise ValueError("Invalid shared-input reference.")
    folder = root / namespace
    if folder.is_symlink():
        raise ValueError("Shared input directories cannot be symbolic links.")
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = folder / source.name
    if destination.is_symlink() or not destination.resolve().is_relative_to(root):
        raise ValueError("Shared input path escapes its managed directory.")
    temporary = folder / (".upload-" + uuid4().hex)
    try:
        with source.open("rb") as reader, temporary.open("xb") as writer:
            shutil.copyfileobj(reader, writer, 1024 * 1024)
        if expected_sha and hashlib.sha256(temporary.read_bytes()).hexdigest() != expected_sha:
            raise ValueError("Shared input failed its integrity check.")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return str(Path(remote_root) / namespace / source.name)
