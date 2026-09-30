"""Transactional job state. SQLite is the sole lifecycle authority."""

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4, uuid5

from .execution_environment import EnvironmentRecord
from .models import Job, Status
from .requests import TASK_ADAPTER, TaskRequest, input_identifiers


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
            db.execute(
                "CREATE TABLE IF NOT EXISTS job_environments ("
                "job_id TEXT PRIMARY KEY, snapshot_sha256 TEXT NOT NULL, record TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS queue_control(key TEXT PRIMARY KEY,value TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS batches (idempotency_key TEXT PRIMARY KEY, "
                "requests TEXT NOT NULL, job_ids TEXT NOT NULL, created_at TEXT NOT NULL)"
            )

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

    def bind_environment(self, job_id: str, record: EnvironmentRecord) -> None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone():
                raise ConflictError("Cannot bind an environment to an unknown task.")
            old = db.execute(
                "SELECT record FROM job_environments WHERE job_id=?", (job_id,)
            ).fetchone()
            body = EnvironmentRecord.model_validate_json(record.model_dump_json()).model_dump_json()
            if old:
                if old["record"] != body:
                    raise ConflictError("Task environment binding is immutable; create a new task.")
                return
            db.execute(
                "INSERT INTO job_environments VALUES(?,?,?)", (job_id, record.snapshot_sha256, body)
            )

    def environment(self, job_id: str) -> EnvironmentRecord | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT record FROM job_environments WHERE job_id=?", (job_id,)
            ).fetchone()
        return EnvironmentRecord.model_validate_json(row["record"]) if row else None

    def list_jobs(self, limit: int = 100, offset: int = 0) -> list[Job]:
        with self.connect() as db:
            return [
                self.decode(row)
                for row in db.execute(
                    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)
                )
            ]

    def _create_in_transaction(
        self,
        db,
        request: TaskRequest,
        key: str,
        max_pending: int,
        max_jobs: int,
        parent_id: str | None = None,
    ) -> Job:
        body = request.model_dump_json()
        old = db.execute("SELECT * FROM jobs WHERE idempotency_key=?", (key,)).fetchone()
        if old:
            previous = TASK_ADAPTER.validate_json(old["request"]).model_dump_json()
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
        for identifier in input_identifiers(request):
            if not db.execute("SELECT 1 FROM assets WHERE id=?", (identifier,)).fetchone():
                raise ConflictError(
                    "An uploaded input was removed before submission. Upload it again."
                )
        job_id = str(uuid4())
        digest = hashlib.sha256((body + (parent_id or "")).encode()).hexdigest()
        db.execute(
            "INSERT INTO jobs(id,request,request_hash,idempotency_key,status,created_at,parent_id) "
            "VALUES(?,?,?,?,?,?,?)",
            (job_id, body, digest, key, Status.QUEUED, now(), parent_id),
        )
        return self.decode(db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())

    def create(
        self,
        request: TaskRequest,
        key: str,
        max_pending: int,
        max_jobs: int,
        parent_id: str | None = None,
    ) -> Job:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            return self._create_in_transaction(db, request, key, max_pending, max_jobs, parent_id)

    def create_batch(
        self, requests: list[TaskRequest], key: UUID, max_pending: int, max_jobs: int
    ) -> list[Job]:
        bodies = [request.model_dump(mode="json") for request in requests]
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute(
                "SELECT * FROM batches WHERE idempotency_key=?", (str(key),)
            ).fetchone()
            if previous:
                normalized = [
                    TASK_ADAPTER.validate_python(value).model_dump(mode="json")
                    for value in json.loads(previous["requests"])
                ]
                if normalized != bodies:
                    raise ConflictError("Batch key was used for a different set of tasks.")
                existing_jobs = [
                    self.decode(
                        db.execute("SELECT * FROM jobs WHERE id=?", (identifier,)).fetchone()
                    )
                    for identifier in json.loads(previous["job_ids"])
                ]
                if any(job is None for job in existing_jobs):
                    raise ConflictError(
                        "Batch state is incomplete. Restore the missing jobs from backup."
                    )
                return existing_jobs
            jobs = [
                self._create_in_transaction(
                    db, request, str(uuid5(key, f"batch:{index}")), max_pending, max_jobs
                )
                for index, request in enumerate(requests)
            ]
            db.execute(
                "INSERT INTO batches(idempotency_key,requests,job_ids,created_at) VALUES(?,?,?,?)",
                (
                    str(key),
                    json.dumps(bodies, ensure_ascii=False),
                    json.dumps([job.id for job in jobs]),
                    now(),
                ),
            )
            return jobs

    def next_queued(self) -> Job | None:
        with self.connect() as db:
            return self.decode(
                db.execute(
                    "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
                ).fetchone()
            )

    def pause_queue(self, job_id: str, reason: str) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO queue_control(key,value) VALUES('halt',?)",
                (json.dumps({"job_id": job_id, "reason": reason}),),
            )

    def queue_halt(self):
        with self.connect() as db:
            row = db.execute("SELECT value FROM queue_control WHERE key='halt'").fetchone()
        return json.loads(row[0]) if row else None

    def clear_queue_halt(self, job_id: str) -> None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT value FROM queue_control WHERE key='halt'").fetchone()
            if row and json.loads(row[0])["job_id"] == job_id:
                db.execute("DELETE FROM queue_control WHERE key='halt'")

    def claim(self, expected_id: str | None = None) -> Job | None:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            ).fetchone()
            if not row:
                return None
            if expected_id is not None and row["id"] != expected_id:
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
                """UPDATE jobs SET status=CASE WHEN status='cancelling'
                AND ? NOT IN ('failed','interrupted') THEN 'cancelled' ELSE ? END,
                error=?, finished_at=? WHERE id=? AND status IN ('running','cancelling')""",
                (status, status, error, now(), job_id),
            )

    def unfinished(self) -> list[Job]:
        with self.connect() as db:
            return [
                self.decode(row)
                for row in db.execute("SELECT * FROM jobs WHERE status IN ('running','cancelling')")
            ]
