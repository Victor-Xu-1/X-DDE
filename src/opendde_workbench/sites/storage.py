"""Immutable derived site sets share the platform database and asset authority."""

import hashlib
import logging
from uuid import UUID, uuid5

from ..store import ConflictError, now
from .association import associate
from .contracts import BindingSiteSet

NAMESPACE = UUID("ad27fa9d-1f44-4876-9eaa-98002de1162e")
LOG = logging.getLogger(__name__)


class SiteSets:
    def __init__(self, store, assets, settings):
        self.store, self.assets, self.settings = store, assets, settings
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_site_sets("
                "id TEXT PRIMARY KEY,ensemble_id TEXT NOT NULL,request_hash TEXT NOT NULL,"
                "body TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS research_site_set_ensemble "
                "ON research_site_sets(ensemble_id)"
            )

    def sources(self, ensemble_id, limit=200, offset=0):
        from ..research.receptor_sets import ReceptorSets

        ensemble = ReceptorSets(self.store, self.assets).get(ensemble_id)
        refs = [
            m.reference
            for m in ensemble.members
            if m.reference and m.evidence.quality and m.evidence.quality.backbone_complete
        ]
        if not refs:
            return []
        clauses, parameters = [], []
        for ref in refs:
            clauses.append(
                "("
                + " AND ".join(
                    "json_extract(request,'$.protein." + field + "') IS ?"
                    for field in ("asset_id", "sha256", "version_id", "record", "conformer")
                )
                + ")"
            )
            parameters.extend(
                [
                    str(ref.asset_id),
                    ref.sha256,
                    str(ref.version_id) if ref.version_id else None,
                    ref.record,
                    ref.conformer,
                ]
            )
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM jobs WHERE status='succeeded' "
                "AND json_extract(request,'$.operation')='pocket_search' AND ("
                + " OR ".join(clauses)
                + ") ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (*parameters, limit, offset),
            ).fetchall()
        return [self.store.decode(row) for row in rows]

    def save(self, value, key):
        from .evidence import load_evidence

        identifier = str(uuid5(NAMESPACE, str(key)))
        request_hash = hashlib.sha256(value.model_dump_json().encode()).hexdigest()
        # Retrying a successfully saved snapshot does not depend on live task-file retention.
        with self.store.connect() as db:
            old = db.execute(
                "SELECT * FROM research_site_sets WHERE id=?", (identifier,)
            ).fetchone()
        if old:
            if old["request_hash"] != request_hash:
                raise ConflictError(
                    "Site-set key already identifies a different immutable analysis."
                )
            return self.decode(old)
        ensemble, observations = load_evidence(self.store, self.assets, self.settings, value)
        sites, relations, groups = associate(ensemble, observations, value.options)
        reference = ensemble.members[ensemble.options.reference_index].reference
        if reference is None:
            raise ValueError("A qualified reference is required for cross-conformation sites.")
        record = BindingSiteSet(
            id=identifier,
            request=value,
            reference=reference,
            alignment_job=ensemble.source_job,
            observations=observations,
            sites=sites,
            relations=relations,
            groups=groups,
            created_at=now(),
        )
        body = record.model_dump_json()
        checksum = hashlib.sha256(body.encode()).hexdigest()
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT * FROM research_site_sets WHERE id=?", (identifier,)
            ).fetchone()
            if old:
                if old["request_hash"] != request_hash:
                    raise ConflictError("Site-set key identifies a different analysis.")
                return self.decode(old)
            row = db.execute(
                "SELECT * FROM research_receptor_sets WHERE id=?", (str(value.ensemble_id),)
            ).fetchone()
            from ..research.receptor_sets import ReceptorSets

            if row is None or ReceptorSets.decode(row) != ensemble:
                raise ValueError("Receptor collection changed before saving the site set.")
            for observation in observations:
                row = db.execute(
                    "SELECT status,request FROM jobs WHERE id=?", (str(observation.source_job),)
                ).fetchone()
                if not row or row["status"] != "succeeded":
                    raise ValueError("Pocket task became unavailable before saving.")
                from ..requests import TASK_ADAPTER

                current = TASK_ADAPTER.validate_json(row["request"])
                if (
                    current.operation != "pocket_search"
                    or current.protein != observation.protein
                    or current.profile != observation.profile
                    or current.point_threshold != observation.point_threshold
                    or current.minimum_cluster != observation.minimum_cluster
                ):
                    raise ValueError("Pocket input changed before saving.")
            db.execute(
                "INSERT INTO research_site_sets VALUES(?,?,?,?,?,?)",
                (
                    identifier,
                    str(value.ensemble_id),
                    request_hash,
                    body,
                    checksum,
                    record.created_at,
                ),
            )
        LOG.info(
            "site_set_saved",
            extra={
                "site_set_id": identifier,
                "ensemble_id": str(value.ensemble_id),
                "site_count": len(sites),
                "observation_count": len(observations),
            },
        )
        return record

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Stored site-set evidence failed integrity verification.")
        record = BindingSiteSet.model_validate_json(row["body"])
        if (
            str(record.id) != row["id"]
            or str(record.request.ensemble_id) != row["ensemble_id"]
            or hashlib.sha256(record.request.model_dump_json().encode()).hexdigest()
            != row["request_hash"]
        ):
            raise ValueError("Site-set identity differs from its immutable request.")
        return record

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_site_sets WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Binding site set not found.")
        return self.decode(row)

    def list(self, limit=100, offset=0, ensemble_id=None):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_site_sets "
                + ("WHERE ensemble_id=? " if ensemble_id else "")
                + "ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (str(ensemble_id), limit, offset) if ensemble_id else (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]
