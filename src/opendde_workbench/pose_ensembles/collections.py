"""Completed pose sets derive from existing workflow attempts, never another execution loop."""

import hashlib
from uuid import uuid5

from ..store import ConflictError, now
from ..workflows.contracts import PlanInput
from .models import PoseEnsemble
from .outcomes import capture_outcomes
from .storage import NAMESPACE, Explorations


class PoseSets:
    def __init__(self, store, assets, settings):
        self.store, self.assets, self.settings = store, assets, settings
        self.explorations = Explorations(store, assets, settings)
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_pose_sets("
                "id TEXT PRIMARY KEY,exploration_id TEXT NOT NULL,run_id TEXT UNIQUE NOT NULL,"
                "body TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS pose_set_exploration "
                "ON research_pose_sets(exploration_id)"
            )

    def capture(self, exploration_id, run_id):
        exploration = self.explorations.get(exploration_id)
        run = self.explorations.workflows.run(run_id)
        if run["plan_id"] != str(exploration.plan_id):
            raise ValueError("Selected run does not execute this pose exploration plan.")
        if run["state"] not in {"succeeded", "failed", "cancelled"}:
            raise ValueError("Pause/blocked/running runs are not complete; finish or cancel first.")
        identifier = str(uuid5(NAMESPACE, "set:" + str(run_id)))
        with self.store.connect() as db:
            old = db.execute(
                "SELECT * FROM research_pose_sets WHERE id=?", (identifier,)
            ).fetchone()
        if old:
            record = self.decode(old)
            if record.exploration_id != exploration.id:
                raise ConflictError("Run already belongs to another pose collection.")
            return record
        saved = self.explorations.workflows.plan(exploration.plan_id)
        if saved["sha256"] != exploration.plan_sha256:
            raise ValueError("Exploration plan changed after review.")
        plan = PlanInput.model_validate(saved["body"])
        outcomes = capture_outcomes(exploration, run, self.store, self.assets, self.settings, plan)
        record = PoseEnsemble(
            id=identifier,
            exploration_id=exploration.id,
            run_id=run_id,
            workflow_state=run["state"],
            outcomes=outcomes,
            qualified_pose_count=sum(p.evidence.valid for o in outcomes for p in o.poses),
            collection_status="complete"
            if run["state"] == "succeeded" and all(o.status == "succeeded" for o in outcomes)
            else "partial",
            created_at=now(),
        )
        body = record.model_dump_json()
        digest = hashlib.sha256(body.encode()).hexdigest()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT state,plan_id FROM workflow_runs WHERE id=?", (str(run_id),)
            ).fetchone()
            if row is None or row["state"] != run["state"] or row["plan_id"] != run["plan_id"]:
                raise ValueError("Run state changed before capturing its immutable pose set.")
            old = db.execute(
                "SELECT * FROM research_pose_sets WHERE id=?", (identifier,)
            ).fetchone()
            if old:
                return self.decode(old)
            db.execute(
                "INSERT INTO research_pose_sets VALUES(?,?,?,?,?,?)",
                (identifier, str(exploration.id), str(run_id), body, digest, record.created_at),
            )
        return record

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Stored pose collection failed integrity verification.")
        record = PoseEnsemble.model_validate_json(row["body"])
        if (str(record.id), str(record.exploration_id), str(record.run_id)) != (
            row["id"],
            row["exploration_id"],
            row["run_id"],
        ):
            raise ValueError("Pose collection identity differs from its stored evidence.")
        return record

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_pose_sets WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Pose ensemble not found.")
        return self.decode(row)

    def list(self, limit=100, offset=0, exploration_id=None):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_pose_sets "
                + ("WHERE exploration_id=? " if exploration_id else "")
                + "ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (str(exploration_id), limit, offset) if exploration_id else (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]
