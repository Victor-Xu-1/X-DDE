"""Derived score records live in the same Store as their native source collection."""

import hashlib
from collections import defaultdict
from uuid import uuid5

from ..store import ConflictError, now
from .comparison_sources import comparison_inputs
from .ranking import rank_native_scores
from .score_contracts import ComparedPose, ScoreComparison, ScoreGroup
from .storage import NAMESPACE


class ScoreComparisons:
    def __init__(self, sets):
        self.sets, self.store = sets, sets.store
        with self.store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_pose_comparisons("
                "id TEXT PRIMARY KEY,pose_set_id TEXT NOT NULL,request_hash TEXT NOT NULL,"
                "body TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS pose_comparison_set "
                "ON research_pose_comparisons(pose_set_id)"
            )

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Score comparison failed integrity verification.")
        value = ScoreComparison.model_validate_json(row["body"])
        if (str(value.id), str(value.request.pose_set_id)) != (row["id"], row["pose_set_id"]) or (
            hashlib.sha256(value.request.model_dump_json().encode()).hexdigest()
            != row["request_hash"]
        ):
            raise ValueError("Score comparison identity differs from its immutable request.")
        return value

    def save(self, request, key):
        identifier = str(uuid5(NAMESPACE, "comparison:" + str(key)))
        request_hash = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        with self.store.connect() as db:
            old = db.execute(
                "SELECT * FROM research_pose_comparisons WHERE id=?", (identifier,)
            ).fetchone()
        if old:
            if old["request_hash"] != request_hash:
                raise ConflictError(
                    "Comparison key identifies different selected poses or metrics."
                )
            return self.decode(old)
        collection = self.sets.get(request.pose_set_id)
        exploration = self.sets.explorations.get(collection.exploration_id)
        plan = self.sets.explorations.workflows.plan(exploration.plan_id)
        candidates, contexts, sources = comparison_inputs(request, collection, exploration, plan)
        ranks = rank_native_scores(candidates, request.metrics)
        selections = {(s.step_id, s.record): s for s in request.selections}
        grouped = defaultdict(list)
        for result in ranks:
            grouped[result.condition_sha256].append(
                ComparedPose(
                    selection=selections[result.key],
                    reference=sources[result.key].reference,
                    scores=sources[result.key].evidence.scores,
                    front=result.front,
                    missing_metrics=result.missing_metrics,
                )
            )
        exploration_body = exploration.model_dump_json()
        source_body = collection.model_dump_json()
        source_hash = hashlib.sha256(source_body.encode()).hexdigest()
        record = ScoreComparison(
            id=identifier,
            request=request,
            exploration_id=collection.exploration_id,
            pose_set_sha256=source_hash,
            groups=tuple(
                ScoreGroup(condition_sha256=key, conditions=contexts[key], poses=tuple(rows))
                for key, rows in sorted(grouped.items())
            ),
            created_at=now(),
        )
        body = record.model_dump_json()
        digest = hashlib.sha256(body.encode()).hexdigest()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT * FROM research_pose_comparisons WHERE id=?", (identifier,)
            ).fetchone()
            if old:
                if old["request_hash"] != request_hash:
                    raise ConflictError(
                        "Comparison key identifies different selected poses or metrics."
                    )
                return self.decode(old)
            current = db.execute(
                "SELECT * FROM research_pose_sets WHERE id=?", (str(collection.id),)
            ).fetchone()
            if current is None or self.sets.decode(current).model_dump_json() != source_body:
                raise ValueError("Native pose evidence changed before comparison was saved.")
            current_exploration = db.execute(
                "SELECT * FROM research_pose_explorations WHERE id=?", (str(exploration.id),)
            ).fetchone()
            if current_exploration is None or (
                self.sets.explorations.decode(current_exploration).model_dump_json()
                != exploration_body
            ):
                raise ValueError("Frozen exploration conditions changed before comparison.")
            current_plan = db.execute(
                "SELECT * FROM workflow_plans WHERE id=?", (str(exploration.plan_id),)
            ).fetchone()
            if (
                current_plan is None
                or current_plan["sha256"] != exploration.plan_sha256
                or (
                    hashlib.sha256(current_plan["body"].encode()).hexdigest()
                    != current_plan["sha256"]
                )
            ):
                raise ValueError("Frozen native calculation plan changed before comparison.")
            db.execute(
                "INSERT INTO research_pose_comparisons VALUES(?,?,?,?,?,?)",
                (identifier, str(collection.id), request_hash, body, digest, record.created_at),
            )
        return record

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_pose_comparisons WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Pose score comparison not found.")
        return self.decode(row)

    def list(self, limit=100, offset=0, pose_set_id=None):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_pose_comparisons "
                + ("WHERE pose_set_id=? " if pose_set_id else "")
                + "ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (str(pose_set_id), limit, offset) if pose_set_id else (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]
