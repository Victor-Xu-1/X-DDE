"""Resumable transfers publish into the sole AssetStore, not another data authority."""

import hashlib
import os
import re
import shutil
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .assets import Asset
from .dataset_inputs import UPLOAD_CHUNK_BYTES, data_suffix, inspect_data
from .store import ConflictError, now


class UploadInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(pattern=r"^(library|counts|reads)$")
    size: int = Field(gt=0, strict=True)


class UploadStore:
    def __init__(self, assets, max_file: int, quota: int, minimum_free: int):
        self.assets, self.max_file, self.quota, self.minimum_free = (
            assets,
            max_file,
            quota,
            minimum_free,
        )
        if min(max_file, quota) <= 0 or minimum_free < 0 or max_file > quota:
            raise ValueError("Configure research budgets with file size within total storage.")
        self.root = assets.root / ".uploads"
        if self.root.is_symlink():
            raise ValueError("Managed upload storage cannot be a symbolic link.")
        self.root.mkdir(exist_ok=True, mode=0o700)
        with assets.store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS asset_uploads (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
                suffix TEXT NOT NULL, size INTEGER NOT NULL, offset INTEGER NOT NULL,
                state TEXT NOT NULL, asset_id TEXT, created_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS asset_upload_chunks (
                upload_id TEXT NOT NULL, offset INTEGER NOT NULL, size INTEGER NOT NULL,
                sha256 TEXT NOT NULL, PRIMARY KEY(upload_id,offset))""")

    def get(self, identifier):
        identifier = str(UUID(str(identifier)))
        with self.assets.store.connect() as db:
            row = db.execute("SELECT * FROM asset_uploads WHERE id=?", (identifier,)).fetchone()
        if not row:
            raise FileNotFoundError("Research upload not found.")
        return dict(row)

    def path(self, row):
        folder = self.root / str(UUID(row["id"]))
        file = folder / "content"
        if self.root.is_symlink() or folder.is_symlink() or file.is_symlink() or not file.is_file():
            raise ValueError("Research upload is unavailable or unsafe.")
        if not file.resolve().is_relative_to(self.root.resolve()):
            raise ValueError("Research upload escaped its managed directory.")
        return file

    def create(self, value: UploadInput, identifier: UUID):
        name = re.split(r"[/\\]", value.name)[-1].strip()
        if not name or any(ord(c) < 32 or ord(c) == 127 for c in name):
            raise ValueError("Use a readable research filename.")
        suffix = data_suffix(name, value.kind)
        if value.size > self.max_file:
            raise ValueError("Research file exceeds this server's configured file budget.")
        identifier = str(identifier)
        folder = self.root / identifier
        created = False
        try:
            with self.assets.store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                existing = db.execute(
                    "SELECT * FROM asset_uploads WHERE id=?", (identifier,)
                ).fetchone()
                if existing:
                    if (existing["name"], existing["kind"], existing["size"]) != (
                        name,
                        value.kind,
                        value.size,
                    ):
                        raise ConflictError("Upload key identifies a different file.")
                    return dict(existing)
                used = db.execute(
                    "SELECT coalesce(sum(size),0) FROM assets "
                    "WHERE kind IN ('library','counts','reads')"
                ).fetchone()[0]
                reserved = db.execute(
                    "SELECT coalesce(sum(size),0) FROM asset_uploads WHERE state='uploading'"
                ).fetchone()[0]
                if used + reserved + value.size > self.quota:
                    raise ValueError("Research dataset storage budget is full.")
                remaining = db.execute(
                    "SELECT coalesce(sum(size-offset),0) FROM asset_uploads WHERE state='uploading'"
                ).fetchone()[0]
                if (
                    shutil.disk_usage(self.assets.root).free
                    < value.size + remaining + self.minimum_free
                ):
                    raise ValueError("There is insufficient free space for this research upload.")
                folder.mkdir(mode=0o700)
                created = True
                (folder / "content").touch(exist_ok=False)
                db.execute(
                    "INSERT INTO asset_uploads VALUES(?,?,?,?,?,0,'uploading',NULL,?)",
                    (identifier, name, value.kind, suffix, value.size, now()),
                )
        except Exception:
            if created:
                shutil.rmtree(folder)
            raise
        return self.get(identifier)

    def append(self, identifier, offset: int, content: bytes, sha256: str):
        if not 0 < len(content) <= UPLOAD_CHUNK_BYTES:
            raise ValueError("Upload one nonempty research chunk within the transfer limit.")
        if (
            not re.fullmatch(r"[a-f0-9]{64}", sha256)
            or hashlib.sha256(content).hexdigest() != sha256
        ):
            raise ValueError("Research upload chunk failed its integrity check.")
        row = self.get(identifier)
        if row["state"] != "uploading":
            raise ConflictError("Research upload is no longer accepting chunks.")
        path = self.path(row)
        with self.assets.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = dict(
                db.execute("SELECT * FROM asset_uploads WHERE id=?", (row["id"],)).fetchone()
            )
            if current["state"] != "uploading" or path.stat().st_size < current["offset"]:
                raise ConflictError("Research upload state differs from its stored bytes.")
            if path.stat().st_size > current["offset"]:
                # A crash may leave an uncommitted tail in this temporary transfer.
                # Only the committed offset/chunk manifest is authoritative.
                with path.open("r+b") as stream:
                    stream.truncate(current["offset"])
            if offset < current["offset"] and offset + len(content) <= current["offset"]:
                with path.open("rb") as stream:
                    stream.seek(offset)
                    if stream.read(len(content)) != content:
                        raise ConflictError(
                            "Retried research chunk differs from the received file."
                        )
                return current
            if offset != current["offset"] or offset + len(content) > current["size"]:
                raise ConflictError("Resume from the server's confirmed upload offset.")
            if shutil.disk_usage(self.assets.root).free < len(content) + self.minimum_free:
                raise ValueError("Free space fell below the research storage reserve.")
            with path.open("r+b") as stream:
                stream.seek(offset)
                try:
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
                    db.execute(
                        "INSERT INTO asset_upload_chunks VALUES(?,?,?,?)",
                        (row["id"], offset, len(content), sha256),
                    )
                    db.execute(
                        "UPDATE asset_uploads SET offset=? WHERE id=?",
                        (offset + len(content), row["id"]),
                    )
                except Exception:
                    stream.truncate(offset)
                    raise
        return self.get(identifier)

    def chunks(self, identifier, limit=128, offset=0):
        row = self.get(identifier)
        with self.assets.store.connect() as db:
            return [
                dict(value)
                for value in db.execute(
                    "SELECT offset,size,sha256 FROM asset_upload_chunks WHERE upload_id=? "
                    "ORDER BY offset LIMIT ? OFFSET ?",
                    (row["id"], limit, offset),
                )
            ]

    def finalize(self, identifier):
        row = self.get(identifier)
        if row["state"] == "complete":
            return self.assets.get(row["asset_id"])
        if row["state"] != "uploading" or row["offset"] != row["size"]:
            raise ConflictError("Finish the research upload before registering its file.")
        source = self.path(row)
        with self.assets.store.connect() as manifest_db:
            expected = manifest_db.execute(
                "SELECT offset,size,sha256 FROM asset_upload_chunks "
                "WHERE upload_id=? ORDER BY offset",
                (row["id"],),
            )
            digest = inspect_data(source, row["suffix"], expected)
        asset = Asset(
            id=row["id"],
            name=row["name"],
            kind=row["kind"],
            suffix=row["suffix"],
            size=row["size"],
            sha256=digest,
            created_at=now(),
        )
        folder = self.assets.root / asset.id
        target = folder / ("content" + asset.suffix)
        moved = False
        try:
            with self.assets.store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                current = db.execute(
                    "SELECT * FROM asset_uploads WHERE id=?", (asset.id,)
                ).fetchone()
                if current["state"] == "complete":
                    return self.assets.get(current["asset_id"])
                if current["state"] != "uploading" or source.stat().st_size != asset.size:
                    raise ConflictError("Research upload changed before publication.")
                folder.mkdir(exist_ok=False, mode=0o700)
                source.replace(target)
                moved = True
                db.execute(
                    "INSERT INTO assets VALUES(?,?,?,?,?,?,?)",
                    (
                        asset.id,
                        asset.name,
                        asset.kind,
                        asset.suffix,
                        asset.size,
                        asset.sha256,
                        asset.created_at,
                    ),
                )
                db.execute(
                    "UPDATE asset_uploads SET state='complete',asset_id=? WHERE id=?",
                    (asset.id, asset.id),
                )
        except Exception:
            if moved:
                target.replace(source)
                folder.rmdir()
            raise
        source.parent.rmdir()
        return asset

    def cancel(self, identifier):
        row = self.get(identifier)
        if row["state"] == "complete":
            raise ConflictError(
                "A registered research asset is managed through its normal file controls."
            )
        if row["state"] == "cancelled":
            return row
        path = self.path(row)
        with self.assets.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT state FROM asset_uploads WHERE id=?", (row["id"],)
            ).fetchone()
            if current["state"] != "uploading":
                raise ConflictError("Research upload state changed.")
            db.execute("UPDATE asset_uploads SET state='cancelled' WHERE id=?", (row["id"],))
        path.unlink()
        path.parent.rmdir()
        return self.get(identifier)
