"""Transactional job state. SQLite is the sole lifecycle authority."""

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .models import Job, Prediction, Status


def now() -> str:
    return datetime.now(UTC).isoformat()


class ConflictError(Exception):
    pass


class CapacityError(Exception):
    pass


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, request TEXT NOT NULL, request_hash TEXT NOT NULL,
                idempotency_key TEXT UNIQUE NOT NULL, status TEXT NOT NULL,
                created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
                error TEXT, parent_id TEXT)""")
            db.execute("CREATE INDEX IF NOT EXISTS jobs_status_time ON jobs(status, created_at)")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def decode(row) -> Job | None:
        if row is None:
            return None
        data = dict(row)
        data["request"] = json.loads(data["request"])
        return Job.model_validate(data)

    def get(self, job_id: str) -> Job | None:
        with self.connect() as db:
            return self.decode(db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())

    def list_jobs(self, limit: int = 100, offset: int = 0) -> list[Job]:
        with self.connect() as db:
            return [
                self.decode(row)
                for row in db.execute(
                    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)
                )
            ]

    def create(
        self,
        request: Prediction,
        key: str,
        max_pending: int,
        max_jobs: int,
        parent_id: str | None = None,
    ) -> Job:
        body = request.model_dump_json()
        digest = hashlib.sha256((body + (parent_id or "")).encode()).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM jobs WHERE idempotency_key=?", (key,)).fetchone()
            if old:
                # Normalize older requests through the current schema so adding an
                # optional field does not invalidate existing idempotency keys.
                previous = Prediction.model_validate_json(old["request"]).model_dump_json()
                if previous != body or old["parent_id"] != parent_id:
                    raise ConflictError("Idempotency key was used for a different request.")
                return self.decode(old)
            pending = db.execute(
                "SELECT count(*) FROM jobs WHERE status IN ('queued','running','cancelling')"
            ).fetchone()[0]
            total = db.execute("SELECT count(*) FROM jobs").fetchone()[0]
            if pending >= max_pending or total >= max_jobs:
                raise CapacityError(
                    "Task capacity reached. Wait for jobs or archive the state directory."
                )
            job_id = str(uuid4())
            db.execute(
                "INSERT INTO jobs(id,request,request_hash,idempotency_key,"
                "status,created_at,parent_id) "
                "VALUES(?,?,?,?,?,?,?)",
                (job_id, body, digest, key, Status.QUEUED, now(), parent_id),
            )
            return self.decode(db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())

    def claim(self) -> Job | None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            ).fetchone()
            if not row:
                return None
            db.execute(
                "UPDATE jobs SET status='running',started_at=? WHERE id=?", (now(), row["id"])
            )
            return self.decode(db.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone())

    def cancel(self, job_id: str) -> Job:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not row:
                raise KeyError(job_id)
            if row["status"] == Status.QUEUED:
                db.execute(
                    "UPDATE jobs SET status='cancelled',finished_at=? WHERE id=?", (now(), job_id)
                )
            elif row["status"] == Status.RUNNING:
                db.execute("UPDATE jobs SET status='cancelling' WHERE id=?", (job_id,))
            return self.decode(db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())

    def finish(self, job_id: str, status: Status, error: str | None = None) -> None:
        with self.connect() as db:
            db.execute(
                """UPDATE jobs SET status=CASE WHEN status='cancelling' THEN 'cancelled' ELSE ? END,
                error=?, finished_at=? WHERE id=? AND status IN ('running','cancelling')""",
                (status, error, now(), job_id),
            )

    def unfinished(self) -> list[Job]:
        with self.connect() as db:
            return [
                self.decode(row)
                for row in db.execute("SELECT * FROM jobs WHERE status IN ('running','cancelling')")
            ]
