"""Hash once per observed filesystem version; changed metadata invalidates cached evidence."""

import hashlib
from functools import lru_cache
from pathlib import Path


def stamp(path):
    stat = path.stat()
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


@lru_cache(maxsize=16384)
def _verified(file, expected, observed):
    path = Path(file)
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if stamp(path) != observed or actual != expected:
        raise ValueError("A scientific artifact changed or failed its content integrity check.")
    return observed


def verified(path, expected):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Scientific artifacts must be regular managed files.")
    return _verified(str(path.resolve()), expected, stamp(path))
