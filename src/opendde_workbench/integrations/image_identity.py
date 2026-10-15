"""Bind reusable native images to the exact composition implementation as well as locks."""

import hashlib
from pathlib import Path


def composer_digest():
    digest = hashlib.sha256()
    root = Path(__file__).parent
    for name in ("image.py", "offline_context.py", "image_identity.py"):
        digest.update(name.encode() + b"\0")
        digest.update((root / name).read_bytes())
    return digest.hexdigest()
