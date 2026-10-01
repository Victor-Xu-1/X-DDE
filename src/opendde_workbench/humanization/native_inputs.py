"""Read exact shared FASTA snapshots; source files are never rewritten or cropped silently."""

import hashlib

from fasta import read_fasta
from manifest import MAX_RECORDS


def inputs(request, bindings, directory):
    source = request["sequences"]
    binding = bindings[str(source["asset_id"])]
    if not binding.startswith("/job/assets/"):
        raise ValueError("Humanization input escapes its managed snapshot.")
    file = directory / binding.removeprefix("/job/")
    if (
        file.is_symlink()
        or file.suffix not in {".fa", ".fasta"}
        or not file.resolve().is_relative_to((directory / "assets").resolve())
        or file.stat().st_size > 2 * 1024**2
    ):
        raise ValueError("Select an exact bounded FASTA input.")
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("The original sequence input changed.")
    records = read_fasta(raw)
    if len(records) > MAX_RECORDS:
        raise ValueError("Choose at most 20 variable-region sequences per task.")
    return records
