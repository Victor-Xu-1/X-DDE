"""Bounded, resumable, integrity-checked downloads and safe archive extraction."""

import base64
import hashlib
import os
import shutil
import tarfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


def download(
    url: str, destination: Path, checksum: str, report, checkpoint, *, limit=512 * 1024**2
):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and verify(destination, checksum):
        return
    partial = destination.with_suffix(destination.suffix + ".part")
    if partial.is_file() and verify(partial, checksum):
        partial.replace(destination)
        return
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "OpenDDE-Workbench/0.4", "Accept-Encoding": "identity"}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    with urllib.request.urlopen(
        urllib.request.Request(url, headers=headers), timeout=30
    ) as response:
        append = offset > 0 and response.status == 206
        if append and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
            raise ValueError("Download server returned an invalid resume range.")
        size = offset if append else 0
        total = int(response.headers.get("Content-Length", 0)) + size
        if total > limit:
            raise ValueError("Download exceeds the package size limit.")
        with partial.open("ab" if append else "wb") as output:
            previous = -1
            while chunk := response.read(256 * 1024):
                checkpoint()
                size += len(chunk)
                if size > limit:
                    raise ValueError("Download exceeds the package size limit.")
                output.write(chunk)
                progress = int(size * 100 / total) if total else size // 1024**2
                if progress != previous:
                    report(f"Downloading {progress}%" if total else f"Downloaded {progress} MiB")
                    previous = progress
        if total and size != total:
            raise RuntimeError(
                "Download ended before the declared file size. "
                "The confirmed partial download was retained for resume."
            )
    if not verify(partial, checksum):
        partial.unlink()
        raise ValueError("Package checksum mismatch. Nothing was activated; retry the download.")
    partial.replace(destination)


def verify(path: Path, expected: str):
    algorithm = "sha512" if expected.startswith("sha512:") else "sha256"
    with path.open("rb") as file:
        digest = hashlib.file_digest(file, algorithm)
    actual = (
        base64.b64encode(digest.digest()).decode() if algorithm == "sha512" else digest.hexdigest()
    )
    return actual == expected.removeprefix("sha512:")


def extract(archive: Path, destination: Path, checkpoint, *, skipped_links=None):
    destination.mkdir(parents=True, exist_ok=True)
    total = 0
    names = set()

    def target(name, size):
        nonlocal total
        checkpoint()
        clean = PurePosixPath(name)
        if clean.is_absolute() or ".." in clean.parts or "\\" in name or ":" in name:
            raise ValueError("Archive contains an unsafe path.")
        path = destination.joinpath(*clean.parts)
        if not path.resolve().is_relative_to(destination.resolve()):
            raise ValueError("Archive escapes its destination.")
        total += size
        if total > 1024**3 or name in names or len(names) >= 30000:
            raise ValueError("Archive exceeds extraction limits or contains duplicate paths.")
        names.add(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as source:
            for item in source.infolist():
                if item.is_dir():
                    continue
                if (item.external_attr >> 16) & 0o170000 == 0o120000:
                    expected = (skipped_links or {}).get(item.filename)
                    if (
                        expected
                        and item.file_size <= 4096
                        and source.read(item) == expected.encode()
                    ):
                        # Reviewed upstream tutorial/test aliases are omitted.
                        # Validate their paths and duplicates, but never create or follow links.
                        target(item.filename, item.file_size)
                        continue
                    raise ValueError("Archive symlinks are not allowed.")
                path = target(item.filename, item.file_size)
                with source.open(item) as input_file, path.open("wb") as output:
                    shutil.copyfileobj(input_file, output)
    else:
        with tarfile.open(archive, "r:gz") as source:
            for item in source:
                if item.isdir():
                    continue
                # A checksum-reviewed recipe may omit named upstream test aliases.
                # Links are never created, followed or accepted by other recipes.
                if item.issym() and (skipped_links or {}).get(item.name) == item.linkname:
                    checkpoint()
                    continue
                if not item.isfile():
                    raise ValueError("Archive links and special files are not allowed.")
                path = target(item.name, item.size)
                with source.extractfile(item) as input_file, path.open("wb") as output:
                    shutil.copyfileobj(input_file, output)
    # Artifacts are data until an explicit, fixed installer step uses them.
    for directory, _, files in os.walk(destination):
        for name in files:
            (Path(directory) / name).chmod(0o600)
