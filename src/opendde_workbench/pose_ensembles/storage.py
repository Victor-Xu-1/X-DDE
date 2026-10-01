"""Atomic exploration-plus-plan insertion in the sole platform database."""

import hashlib
from uuid import UUID, uuid5

from ..store import ConflictError, now
from ..workflows.storage import WorkflowRecords
from .models import ExplorationPlan
from .sources import validate_sources

NAMESPACE = UUID("0b8cbcc2-6358-444a-94b6-e949ec2fd16a")


class Explorations:
    def __init__(self, store, assets, settings):
        self.store, self.assets, self.settings = store, assets, settings
        self.workflows = WorkflowRecords(store)
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_pose_explorations("
                "id TEXT PRIMARY KEY,site_set_id TEXT NOT NULL,request_hash TEXT NOT NULL,"
                "body TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS pose_exploration_site "
                "ON research_pose_explorations(site_set_id)"
            )

    def save(self, value, key):
        identifier = str(uuid5(NAMESPACE, "exploration:" + str(key)))
        request_hash = hashlib.sha256(value.model_dump_json().encode()).hexdigest()
        with self.store.connect() as db:
            old = db.execute(
                "SELECT * FROM research_pose_explorations WHERE id=?", (identifier,)
            ).fetchone()
        if old:
            if old["request_hash"] != request_hash:
                raise ConflictError("Exploration key identifies different immutable inputs.")
            return self.decode(old)
        sites, plan, combinations = validate_sources(value, self.store, self.assets, self.settings)
        site_hash = hashlib.sha256(sites.model_dump_json().encode()).hexdigest()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT * FROM research_pose_explorations WHERE id=?", (identifier,)
            ).fetchone()
            if old:
                if old["request_hash"] != request_hash:
                    raise ConflictError("Exploration key identifies different immutable inputs.")
                return self.decode(old)
            row = db.execute(
                "SELECT * FROM research_site_sets WHERE id=?", (str(sites.id),)
            ).fetchone()
            if row is None or row["sha256"] != site_hash:
                raise ValueError("Saved site evidence changed before planning.")
            for combination in combinations:
                for reference in (combination.receptor, combination.ligand.reference):
                    row = db.execute(
                        "SELECT body FROM scientific_objects WHERE id=?",
                        (str(reference.version_id),),
                    ).fetchone()
                    from ..research.contracts import ScientificObject

                    if (
                        row is None
                        or ScientificObject.model_validate_json(row["body"]).reference != reference
                    ):
                        raise ValueError("Scientific version changed before planning.")
            plan_id, plan_hash = self.workflows.insert_plan(
                db, plan, uuid5(NAMESPACE, "plan:" + str(key))
            )
            record = ExplorationPlan(
                id=identifier,
                request=value,
                site_set_sha256=site_hash,
                plan_id=plan_id,
                plan_sha256=plan_hash,
                combinations=combinations,
                created_at=now(),
            )
            body = record.model_dump_json()
            digest = hashlib.sha256(body.encode()).hexdigest()
            db.execute(
                "INSERT INTO research_pose_explorations VALUES(?,?,?,?,?,?)",
                (identifier, str(value.site_set_id), request_hash, body, digest, record.created_at),
            )
        return record

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Exploration document failed integrity verification.")
        record = ExplorationPlan.model_validate_json(row["body"])
        if (
            str(record.id) != row["id"]
            or str(record.request.site_set_id) != row["site_set_id"]
            or hashlib.sha256(record.request.model_dump_json().encode()).hexdigest()
            != row["request_hash"]
        ):
            raise ValueError("Exploration identity differs from its immutable request.")
        return record

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_pose_explorations WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Pose exploration not found.")
        return self.decode(row)

    def list(self, limit=100, offset=0, site_set_id=None):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_pose_explorations "
                + ("WHERE site_set_id=? " if site_set_id else "")
                + "ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (str(site_set_id), limit, offset) if site_set_id else (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]
