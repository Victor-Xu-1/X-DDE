"""Recheck immutable package bytes before constructing an offline image context."""

import hashlib
import shutil


def stage_archives(entries, destination):
    if not entries:
        raise ValueError("Offline scientific installation requires verified dependency archives.")
    destination.mkdir(parents=True, exist_ok=True)
    names = set()
    for entry in entries:
        source = entry["file"]
        if source.is_symlink() or not source.is_file() or source.name in names:
            raise ValueError("Dependency archive is missing, linked or duplicated.")
        names.add(source.name)
        with source.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != entry["sha256"]:
                raise ValueError("Dependency archive changed after checksum verification.")
        shutil.copyfile(source, destination / source.name)
