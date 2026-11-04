"""Small, transactional snapshots in the existing configured platform database."""

import json

from ..store import CapacityError, ConflictError, Store, now
from .models import Draft, DraftInput, DraftSummary


class DraftStore:
    def __init__(self, store: Store):
        self.store = store
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS prediction_drafts (
                id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL)
            """)
            db.execute(
                "CREATE INDEX IF NOT EXISTS prediction_drafts_time "
                "ON prediction_drafts(archived,updated_at)"
            )

    @staticmethod
    def decode(row):
        if row is None:
            return None
        body = json.loads(row["body"])
        return Draft(
            id=row["id"],
            revision=row["revision"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            archived=bool(row["archived"]),
            name=body["state"]["name"],
            entities=len(body["state"]["components"]),
            **body,
        )

    def get(self, identifier: str):
        with self.store.connect() as db:
            return self.decode(
                db.execute("SELECT * FROM prediction_drafts WHERE id=?", (identifier,)).fetchone()
            )

    def list(self, archived: bool = False, offset: int = 0):
        with self.store.connect() as db:
            return [
                DraftSummary.model_validate(self.decode(row).model_dump(exclude={"state"}))
                for row in db.execute(
                    "SELECT * FROM prediction_drafts WHERE archived=? "
                    "ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET ?",
                    (int(archived), offset),
                )
            ]

    @staticmethod
    def capacity(db):
        if (
            db.execute("SELECT count(*) FROM prediction_drafts WHERE archived=0").fetchone()[0]
            >= 30
        ):
            raise CapacityError("30 saved drafts reached. Archive a draft before saving another.")

    def save(self, identifier: str, value: DraftInput):
        body = value.model_dump(mode="json", exclude={"revision"})
        encoded = json.dumps(body, sort_keys=True, separators=(",", ":"), allow_nan=False)
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM prediction_drafts WHERE id=?", (identifier,)).fetchone()
            if row and row["archived"]:
                raise ConflictError("This draft was archived. Restore it before saving changes.")
            if row and row["body"] == encoded:
                return self.decode(row)  # Retrying a response lost after commit is safe.
            if (row and row["revision"] != value.revision) or (not row and value.revision != 0):
                raise ConflictError("This draft changed elsewhere. Reload it or save a new copy.")
            for identifier_ref in value.state.asset_ids():
                if not db.execute("SELECT 1 FROM assets WHERE id=?", (identifier_ref,)).fetchone():
                    raise ValueError(
                        "A selected input is no longer available. Select its file again."
                    )
            stamp = now()
            if row:
                db.execute(
                    "UPDATE prediction_drafts SET revision=revision+1,body=?,updated_at=? "
                    "WHERE id=?",
                    (encoded, stamp, identifier),
                )
            else:
                self.capacity(db)
                db.execute(
                    "INSERT INTO prediction_drafts VALUES(?,1,?,?,?,0)",
                    (identifier, encoded, stamp, stamp),
                )
            return self.decode(
                db.execute("SELECT * FROM prediction_drafts WHERE id=?", (identifier,)).fetchone()
            )

    def archive(self, identifier: str, revision: int, archived: bool):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM prediction_drafts WHERE id=?", (identifier,)).fetchone()
            if not row:
                raise KeyError(identifier)
            if row["revision"] != revision:
                raise ConflictError("This draft changed elsewhere. Refresh the draft list.")
            if bool(row["archived"]) != archived:
                if not archived:
                    self.capacity(db)
                db.execute(
                    "UPDATE prediction_drafts SET archived=?,revision=revision+1,updated_at=? "
                    "WHERE id=?",
                    (int(archived), now(), identifier),
                )
            return self.decode(
                db.execute("SELECT * FROM prediction_drafts WHERE id=?", (identifier,)).fetchone()
            )
