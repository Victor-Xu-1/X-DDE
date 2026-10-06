"""Verified public ZIP-member ranges avoid downloading unrelated multi-gigabyte models."""

import hashlib
import urllib.request
import zlib
from pathlib import Path


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download_member(resource, member, destination, cache, report, checkpoint):
    transport = member["transport"]
    if Path(member["name"]).name != member["name"] or member["name"] in {".", ".."}:
        raise ValueError("Official model member identity must be a direct managed filename.")
    if transport.get("kind") != "verified_zip_range" or transport["compression"] not in {0, 8}:
        raise ValueError("The reviewed native model transport is unsupported.")
    start, size = transport["start"], transport["size"]
    if (
        not isinstance(start, int)
        or not isinstance(size, int)
        or start < 0
        or size <= 0
        or start + size > resource["size"]
        or member["size"] > 4 * 1024**3
    ):
        raise ValueError("The reviewed native model range exceeds its fixed archive bounds.")
    target = destination / member["name"]
    if (
        target.is_file()
        and target.stat().st_size == member["size"]
        and digest(target) == member["sha256"]
    ):
        return
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.is_file() or cache.stat().st_size != size or digest(cache) != transport["sha256"]:
        partial = cache.with_suffix(cache.suffix + ".part")
        offset = partial.stat().st_size if partial.is_file() else 0
        if offset >= size:
            if offset == size and digest(partial) == transport["sha256"]:
                partial.replace(cache)
            else:
                partial.unlink()
                raise ValueError(
                    "Staged native model bytes failed verification; retry this resource."
                )
        else:
            request = urllib.request.Request(
                resource["url"],
                headers={
                    "User-Agent": "X-DDE-scientific-resources",
                    "Accept-Encoding": "identity",
                    "Range": f"bytes={start + offset}-{start + size - 1}",
                },
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                expected = f"bytes {start + offset}-{start + size - 1}/{resource['size']}"
                if response.status != 206 or response.headers.get("Content-Range") != expected:
                    raise ValueError(
                        "Official download server did not confirm the exact public model range."
                    )
                if int(response.headers.get("Content-Length", 0)) != size - offset:
                    raise ValueError(
                        "Official model range length differs from the reviewed member."
                    )
                written, previous = offset, -1
                with partial.open("ab") as output:
                    while chunk := response.read(256 * 1024):
                        checkpoint()
                        written += len(chunk)
                        if written > size:
                            raise ValueError("Native model range exceeds its fixed byte budget.")
                        output.write(chunk)
                        percent = int(100 * written / size)
                        if percent != previous:
                            report(f"Downloading {member['name']} {percent}%")
                            previous = percent
                if written != size:
                    raise RuntimeError(
                        "Model download was incomplete; staged bytes were retained for resume."
                    )
            if digest(partial) != transport["sha256"]:
                partial.unlink()
                raise ValueError("Downloaded model member transport failed its fixed checksum.")
            partial.replace(cache)
    temporary = target.with_suffix(target.suffix + ".part")
    decompressor = zlib.decompressobj(-15) if transport["compression"] == 8 else None
    written, crc = 0, 0
    with cache.open("rb") as stream, temporary.open("wb") as output:
        while chunk := stream.read(1024**2):
            checkpoint()
            data = (
                decompressor.decompress(chunk, member["size"] - written + 1)
                if decompressor
                else chunk
            )
            written += len(data)
            if written > member["size"] or (decompressor and decompressor.unconsumed_tail):
                raise ValueError("Native model expansion exceeds the reviewed exact member size.")
            crc = zlib.crc32(data, crc)
            output.write(data)
        if decompressor:
            tail = decompressor.flush()
            written += len(tail)
            crc = zlib.crc32(tail, crc)
            output.write(tail)
            if not decompressor.eof or decompressor.unused_data:
                raise ValueError(
                    "The native model ZIP member is incomplete or contains trailing data."
                )
    if (
        written != member["size"]
        or crc != transport["crc32"]
        or digest(temporary) != member["sha256"]
    ):
        raise ValueError("Expanded official model bytes failed their fixed identity checks.")
    temporary.replace(target)
