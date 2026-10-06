"""Data files have explicit formats; molecular/sequence parsers never receive them."""

import codecs
import gzip
import hashlib
from pathlib import Path

DATA_KINDS = frozenset({"library", "counts", "reads"})
DATA_EXTENSIONS = {
    "library": {".sdf", ".csv", ".tsv", ".smi", ".smiles", ".sdf.gz", ".csv.gz", ".tsv.gz"},
    "counts": {".csv", ".tsv", ".csv.gz", ".tsv.gz"},
    "reads": {".fastq", ".fq", ".fastq.gz", ".fq.gz"},
}
UPLOAD_CHUNK_BYTES = 4 * 1024**2


def data_suffix(name: str, kind: str) -> str:
    for suffix in sorted(DATA_EXTENSIONS[kind], key=len, reverse=True):
        if name.lower().endswith(suffix):
            return suffix
    raise ValueError("Select a supported library, count-table or FASTQ file.")


def file_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inspect_data(path: Path, suffix: str, expected_chunks=None) -> str:
    """Full raw-byte/UTF8 validation stays bounded; native jobs validate scientific records."""
    hasher = hashlib.sha256()
    decoder = None if suffix.endswith(".gz") else codecs.getincrementaldecoder("utf-8-sig")()
    with path.open("rb") as stream:
        if expected_chunks is None:
            chunks = iter(lambda: stream.read(1024**2), b"")
        else:

            def confirmed():
                offset = 0
                for expected in expected_chunks:
                    if (
                        expected["offset"] != offset
                        or not 0 < expected["size"] <= UPLOAD_CHUNK_BYTES
                    ):
                        raise ValueError("Research transfer has an invalid chunk manifest.")
                    chunk = stream.read(expected["size"])
                    if hashlib.sha256(chunk).hexdigest() != expected["sha256"]:
                        raise ValueError(
                            "Received research bytes changed; reselect the original file."
                        )
                    offset += len(chunk)
                    yield chunk
                if stream.read(1):
                    raise ValueError("Research transfer has unconfirmed extra bytes.")

            chunks = confirmed()
        for chunk in chunks:
            hasher.update(chunk)
            if decoder is not None:
                if b"\x00" in chunk:
                    raise ValueError("Text research data cannot contain NUL bytes.")
                decoder.decode(chunk)
    if decoder is not None:
        decoder.decode(b"", final=True)
    else:
        with path.open("rb") as stream:
            if stream.read(2) != b"\x1f\x8b":
                raise ValueError("A .gz research file must be an actual GZIP stream.")
        # Read only a bounded prefix. Native parsing separately enforces expanded-byte budgets.
        with gzip.open(path, "rb") as stream:
            prefix = stream.read(65536)
        if b"\x00" in prefix:
            raise ValueError("Compressed research data must contain scientific text.")
        decoder = codecs.getincrementaldecoder("utf-8-sig")()
        decoder.decode(prefix, final=False)
    return hasher.hexdigest()
