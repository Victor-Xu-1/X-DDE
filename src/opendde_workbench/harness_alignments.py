"""Copy exact target-MSA outputs through the already configured shared-file authority."""

import hashlib
import os
import re
from pathlib import Path, PurePosixPath

from alignment_files import MAX_BYTES, checked_alignment


def _safe_name(value):
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip()).strip("-.")[:80] or "target"


def collect_target_alignments(result, payload, directory, *, shared=None, remote=None):
    """No arbitrary provider path, filesystem fallback, search or task re-execution."""
    shared = shared or os.environ.get("WB_SHARED_DIR")
    remote = remote or os.environ.get("WB_REMOTE_DIR")
    if not shared or not remote:
        raise ValueError("Configure shared compute storage to retain target-MSA result files.")
    root, remote_root = Path(shared).resolve(), PurePosixPath(remote)
    if not root.is_dir() or not remote_root.is_absolute() or ".." in remote_root.parts:
        raise ValueError("Target-MSA transfer requires existing absolute shared compute storage.")
    sequence = "".join(payload["sequence"].split()).upper()
    digest = hashlib.sha256(sequence.encode()).hexdigest()
    if (
        result.get("sequence_sha256") != digest
        or result.get("target_name") != payload["target_name"]
        or result.get("chain_id") != payload["chain_id"]
    ):
        raise ValueError("Returned target-MSA identity differs from the submitted target chain.")
    folder = (
        _safe_name(payload["target_name"])
        + "-"
        + _safe_name(payload["chain_id"])
        + "-"
        + digest[:12]
    )
    pending = []
    for field, filename in (
        ("unpaired_msa_path", "non_pairing.a3m"),
        ("paired_msa_path", "pairing.a3m"),
    ):
        relative = PurePosixPath("msa") / folder / filename
        if result.get(field) != str(remote_root / relative):
            raise ValueError(
                "Returned alignment path is outside this target's managed MSA namespace."
            )
        source = root
        for part in relative.parts:
            source = source / part
            if source.is_symlink() or not source.resolve().is_relative_to(root):
                raise ValueError(
                    "Target-MSA files cannot follow symbolic links outside their owner."
                )
        before = source.stat()
        if not source.is_file() or not 0 < before.st_size <= MAX_BYTES:
            raise ValueError("Returned target-MSA file exceeds the bounded scientific input limit.")
        with source.open("rb") as stream:
            data = stream.read(MAX_BYTES + 1)
        after = source.stat()
        if (before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
        ) or len(data) != before.st_size:
            raise ValueError("The target-MSA file changed while retaining its scientific evidence.")
        rows = checked_alignment(data.decode("utf-8-sig"), ".a3m", sequence)
        if field == "unpaired_msa_path" and len(rows) != result.get("alignment_depth"):
            raise ValueError(
                "The native alignment depth differs from its complete target-MSA file."
            )
        pending.append((field, filename, data, len(rows)))
    retained, manifest = dict(result), []
    output = Path(directory) / "output"
    for field, filename, data, row_count in pending:
        with (output / filename).open("xb") as stream:
            stream.write(data)
        retained[field] = filename
        manifest.append(
            {
                "artifact": filename,
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
                "rows": row_count,
                "columns": len(sequence),
            }
        )
    retained["alignment_files"] = manifest
    return retained, [item["artifact"] for item in manifest]
