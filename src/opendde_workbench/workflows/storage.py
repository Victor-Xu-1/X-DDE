"""Plan/run/attempt rows use the existing Store database and job transactions."""

import hashlib
from uuid import UUID, uuid5

from ..store import ConflictError, now
from .contracts import PlanInput

NAMESPACE = UUID("6f17029d-5b6f-45cd-bef8-7e72434b5a3c")


class WorkflowRecords:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS workflow_plans (
                id TEXT PRIMARY KEY, body TEXT NOT NULL, sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS workflow_runs (
                id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, state TEXT NOT NULL,
                reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS workflow_attempts (
                run_id TEXT NOT NULL, step_id TEXT NOT NULL, attempt INTEGER NOT NULL,
                job_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
                PRIMARY KEY(run_id,step_id,attempt))""")

    def insert_plan(self, db, value, key):
        """Single plan insertion authority, also used by compound scientific records."""
        body = value.model_dump_json()
        digest = hashlib.sha256(body.encode()).hexdigest()
        identifier = str(uuid5(NAMESPACE, "plan:" + str(key)))
        old = db.execute("SELECT * FROM workflow_plans WHERE id=?", (identifier,)).fetchone()
        if old:
            if hashlib.sha256(old["body"].encode()).hexdigest() != old["sha256"]:
                raise ValueError("Research plan failed integrity verification.")
            if old["sha256"] != digest or old["body"] != body:
                raise ConflictError("Plan key already identifies different immutable inputs.")
        else:
            db.execute(
                "INSERT INTO workflow_plans VALUES(?,?,?,?)", (identifier, body, digest, now())
            )
        return identifier, digest

    def save_plan(self, value, key):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            identifier, _ = self.insert_plan(db, value, key)
        return self.plan(identifier)

    def plan(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM workflow_plans WHERE id=?", (str(identifier),)
            ).fetchone()
        if not row:
            raise KeyError("Research plan not found.")
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Research plan failed integrity verification.")
        return {
            **dict(row),
            "body": PlanInput.model_validate_json(row["body"]).model_dump(mode="json"),
        }

    def plans(self, limit=100, offset=0):
        with self.store.connect() as db:
            ids = [
                row[0]
                for row in db.execute(
                    "SELECT id FROM workflow_plans ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]
        return [self.plan(identifier) for identifier in ids]

    def start(self, plan_id, digest, key):
        plan = self.plan(plan_id)
        if plan["sha256"] != digest:
            raise ConflictError("The reviewed plan digest does not match. Reload the plan.")
        identifier = str(uuid5(NAMESPACE, "run:" + str(key)))
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT plan_id FROM workflow_runs WHERE id=?", (identifier,)
            ).fetchone()
            if old and old[0] != str(plan_id):
                raise ConflictError("Run key was used for another plan.")
            if not old:
                timestamp = now()
                db.execute(
                    "INSERT INTO workflow_runs VALUES(?,?,?,?,?,?)",
                    (identifier, str(plan_id), "running", None, timestamp, timestamp),
                )
        return self.run(identifier)

    def run(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM workflow_runs WHERE id=?", (str(identifier),)
            ).fetchone()
            if not row:
                raise KeyError("Research run not found.")
            attempts = [
                dict(item)
                for item in db.execute(
                    "SELECT * FROM workflow_attempts WHERE run_id=? "
                    "ORDER BY created_at,step_id,attempt",
                    (str(identifier),),
                )
            ]
        for item in attempts:
            job = self.store.get(item["job_id"])
            item.update(
                status=job.status if job else "missing",
                error=job.error if job else "Task record is missing.",
            )
        return {**dict(row), "attempts": attempts}

    def runs(self, states=None, limit=100, offset=0, plan_id=None):
        clauses, parameters = [], []
        if states:
            clauses.append("state IN (" + ",".join("?" for _ in states) + ")")
            parameters.extend(states)
        if plan_id:
            clauses.append("plan_id=?")
            parameters.append(str(plan_id))
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        order = " ORDER BY created_at" if states else " ORDER BY created_at DESC"
        with self.store.connect() as db:
            ids = [
                r[0]
                for r in db.execute(
                    "SELECT id FROM workflow_runs" + where + order + " LIMIT ? OFFSET ?",
                    (*parameters, limit, offset),
                )
            ]
        return [self.run(identifier) for identifier in ids]

    def change(self, identifier, state, reason=None, expected=None, strict=True):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT state FROM workflow_runs WHERE id=?", (str(identifier),)
            ).fetchone()
            if not row:
                raise KeyError("Research run not found.")
            if expected and row[0] not in expected:
                if strict:
                    raise ConflictError("The research run cannot make this transition.")
                return self.run(identifier)
            db.execute(
                "UPDATE workflow_runs SET state=?,reason=?,updated_at=? WHERE id=?",
                (state, reason, now(), str(identifier)),
            )
        return self.run(identifier)

    def enqueue(self, run_id, step_id, request, max_pending, max_jobs):
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM workflow_runs WHERE id=?", (run_id,)).fetchone()
            if not row or row["state"] != "running":
                return None
            count = db.execute(
                "SELECT count(*) FROM workflow_attempts WHERE run_id=? AND step_id=?",
                (run_id, step_id),
            ).fetchone()[0]
            previous = db.execute(
                "SELECT job_id FROM workflow_attempts WHERE run_id=? AND step_id=? "
                "ORDER BY attempt DESC LIMIT 1",
                (run_id, step_id),
            ).fetchone()
            key = str(uuid5(UUID(run_id), f"{step_id}:{count}"))
            job = self.store._create_in_transaction(
                db, request, key, max_pending, max_jobs, previous[0] if previous else None
            )
            db.execute(
                "INSERT INTO workflow_attempts VALUES(?,?,?,?,?)",
                (run_id, step_id, count, job.id, now()),
            )
        return job
