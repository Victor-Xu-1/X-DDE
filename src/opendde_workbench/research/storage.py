"""Scientific versions in the existing task database, without another file authority."""

import hashlib
from uuid import UUID, uuid4, uuid5

from ..scientific_objects import MoleculeRef
from ..store import ConflictError, now
from .contracts import ScientificObject, VersionInput

NAMESPACE = UUID("c18b63e7-6258-4c08-92a6-1e2e924d0c04")
EXPECTED = {
    "molecule": "ligand",
    "structure": "structure",
    "sequence": "sequences",
    "analysis": "config",
    "pocket": "structure",
}


class ScientificStore:
    def __init__(self, store, assets):
        self.store, self.assets = store, assets
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS scientific_objects (
                id TEXT PRIMARY KEY, family_id TEXT NOT NULL, asset_id TEXT NOT NULL,
                body TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL)""")
            db.execute(
                "CREATE INDEX IF NOT EXISTS scientific_object_asset ON scientific_objects(asset_id)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS scientific_object_family "
                "ON scientific_objects(family_id)"
            )

    @staticmethod
    def decode(row):
        return ScientificObject.model_validate_json(row["body"]) if row else None

    def get(self, identifier):
        with self.store.connect() as db:
            result = self.decode(
                db.execute(
                    "SELECT * FROM scientific_objects WHERE id=?", (str(identifier),)
                ).fetchone()
            )
        if result is None:
            raise KeyError("Scientific asset version not found.")
        return result

    def create(
        self, value: VersionInput, key, *, source_job=None, validation="file_integrity_only"
    ):
        asset = self.assets.get(value.asset_id)
        with self.assets.path(asset).open("rb") as file:
            if hashlib.file_digest(file, "sha256").hexdigest() != asset.sha256:
                raise ValueError("Scientific file failed integrity verification.")
        if asset.kind != EXPECTED[value.kind]:
            raise ValueError("The uploaded file kind does not match the scientific object.")
        if value.kind != "molecule" and (value.record or value.conformer):
            raise ValueError("Only molecular files support explicit record/conformer indices.")
        if value.kind == "molecule" and asset.suffix != ".sdf" and value.record:
            raise ValueError("Only SDF supports multiple molecular records.")
        # Structural parsing and chemical validity belong to scientific adapters. This record
        # explicitly asserts file integrity only unless a native task produced its coordinates.
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM assets WHERE id=?", (asset.id,)).fetchone():
                raise ConflictError("Asset was removed before the version could be registered.")
            parent = (
                self.decode(
                    db.execute(
                        "SELECT * FROM scientific_objects WHERE id=?", (str(value.parent_id),)
                    ).fetchone()
                )
                if value.parent_id
                else None
            )
            if value.parent_id and parent is None:
                raise KeyError("Parent scientific version not found.")
            if parent and parent.kind != value.kind:
                raise ValueError("A version family must retain its scientific object kind.")
            if (
                source_job
                and not db.execute("SELECT 1 FROM jobs WHERE id=?", (str(source_job),)).fetchone()
            ):
                raise KeyError("Source task not found.")
            identifier = str(uuid5(NAMESPACE, str(key)))
            digest = hashlib.sha256(
                (value.model_dump_json() + str(source_job) + validation).encode()
            ).hexdigest()
            old = db.execute(
                "SELECT * FROM scientific_objects WHERE id=?", (identifier,)
            ).fetchone()
            if old:
                if old["request_hash"] != digest:
                    raise ConflictError(
                        "Version idempotency key was used for a different asset or edit."
                    )
                return self.decode(old)
            reference = MoleculeRef(
                asset_id=asset.id,
                sha256=asset.sha256,
                record=value.record,
                conformer=value.conformer,
                version_id=identifier,
            )
            obj = ScientificObject(
                id=identifier,
                family_id=parent.family_id if parent else uuid4(),
                kind=value.kind,
                label=value.label,
                reference=reference,
                parent_id=value.parent_id,
                relation=value.relation,
                notes=value.notes,
                rating=value.rating,
                source_job=source_job,
                validation=validation,
                created_at=now(),
            )
            db.execute(
                "INSERT INTO scientific_objects VALUES(?,?,?,?,?,?)",
                (
                    identifier,
                    str(obj.family_id),
                    asset.id,
                    obj.model_dump_json(),
                    digest,
                    obj.created_at,
                ),
            )
            return obj

    def list(self, limit=100, offset=0):
        with self.store.connect() as db:
            return [
                self.decode(row)
                for row in db.execute(
                    "SELECT * FROM scientific_objects ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]

    def validate_reference(self, ref):
        if ref.version_id:
            try:
                version = self.get(ref.version_id)
            except KeyError as exc:
                raise ValueError("Selected scientific version no longer exists.") from exc
            if version.reference != ref:
                raise ValueError("Scientific reference does not match the saved molecule version.")
