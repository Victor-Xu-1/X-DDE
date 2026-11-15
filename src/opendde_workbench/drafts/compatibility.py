"""Read-only draft compatibility against an exact, trusted target application wheel."""

import hashlib
import json
import re
import sqlite3
import sys
import tempfile
from contextlib import closing
from email.parser import BytesParser
from pathlib import Path
from zipfile import ZipFile

from .compatibility_process import run_probe

MAX_SNAPSHOT_BYTES = 64 * 1024**2
MAX_WHEEL_BYTES = 512 * 1024**2


def _verified_wheel(source: Path, destination: Path, expected: str):
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("An exact lowercase SHA-256 is required for the trusted target wheel.")
    digest, size = hashlib.sha256(), 0
    with source.open("rb") as incoming, destination.open("xb") as staged:
        while block := incoming.read(1024**2):
            size += len(block)
            if size > MAX_WHEEL_BYTES:
                raise ValueError("The trusted target wheel exceeds the 512 MiB guard budget.")
            digest.update(block)
            staged.write(block)
    if digest.hexdigest() != expected:
        raise ValueError("The target wheel does not match its reviewed SHA-256.")
    with ZipFile(destination) as archive:
        entries = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
        if len(entries) != 1 or archive.getinfo(entries[0]).file_size > 65536:
            raise ValueError("Expected one bounded X-DDE wheel metadata entry.")
        metadata = BytesParser().parsebytes(archive.read(entries[0]))
        if metadata["Name"] != "x-dde" or not metadata["Version"]:
            raise ValueError("The reviewed artifact is not an X-DDE application wheel.")
    destination.chmod(0o400)
    return metadata["Version"]


def _snapshot(database: Path, output):
    digest, count, size = hashlib.sha256(), 0, 0
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN")
        exists = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='prediction_drafts'"
        ).fetchone()
        if exists:
            for row in db.execute(
                "SELECT id,revision,body,created_at,updated_at,archived "
                "FROM prediction_drafts ORDER BY id"
            ):
                line = (json.dumps(dict(row), ensure_ascii=False, allow_nan=False) + "\n").encode()
                size += len(line)
                if size > MAX_SNAPSHOT_BYTES:
                    raise ValueError(
                        "Draft compatibility snapshot exceeds the 64 MiB guard budget."
                    )
                output.write(line)
                digest.update(line)
                count += 1
    output.seek(0)
    return count, digest.hexdigest()


def check_draft_compatibility(
    database: Path, wheel: Path, expected_sha256: str, temporary_directory: Path
) -> dict:
    """Check every active/archived row; never install the wheel or mutate the database.

    The caller supplies a reviewed artifact/hash and private temporary storage.
    Repeat immediately after quiescing admissions before changing applications;
    a result produced while edits are allowed is not an admission lock.
    """
    temporary_directory = temporary_directory.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="xdde-draft-check-", dir=temporary_directory) as folder:
        stage = Path(folder).resolve(strict=True)
        if stage.parent != temporary_directory or stage.is_symlink():
            raise ValueError("Compatibility staging escaped the intended temporary directory.")
        target = stage / "target.whl"
        version = _verified_wheel(wheel, target, expected_sha256)
        with (stage / "drafts.ndjson").open("w+b") as snapshot:
            count, fingerprint = _snapshot(database, snapshot)
            result = {"drafts": 0, "rejected": 0, "examples": []}
            if count:
                report = run_probe(
                    [
                        sys.executable,
                        "-I",
                        "-B",
                        str(Path(__file__).with_name("compatibility_probe.py")),
                        str(target),
                    ],
                    stdin=snapshot,
                    timeout=30,
                )
                result = json.loads(report)
                if (
                    not isinstance(result, dict)
                    or set(result) != {"drafts", "rejected", "examples"}
                    or type(result["drafts"]) is not int
                    or result["drafts"] != count
                    or type(result["rejected"]) is not int
                    or not 0 <= result["rejected"] <= count
                    or not isinstance(result["examples"], list)
                    or len(result["examples"]) > 32
                ):
                    raise ValueError(
                        "The target draft validator did not inspect the complete snapshot."
                    )
        return {
            "scope": "prediction_drafts",
            "compatible": result["rejected"] == 0,
            "target_version": version,
            "target_sha256": expected_sha256,
            "snapshot_sha256": fingerprint,
            **result,
        }
