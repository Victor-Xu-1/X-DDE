"""Prepared molecular collections are indexed from validated outputs in the same Store."""

import hashlib
import json
from typing import Literal
from uuid import UUID, uuid5

from pydantic import Field

from ..chemistry.options import StateOptions
from ..chemistry.result import PreparedConformer, PreparedState, validate_result
from ..scientific_objects import MoleculeRef, ScientificModel
from ..store import ConflictError, now
from .storage import ScientificStore

NAMESPACE = UUID("2d925b61-d684-4c9d-9155-2a07f843681e")


class ConformerMember(ScientificModel):
    reference: MoleculeRef
    evidence: PreparedConformer


class StateMember(ScientificModel):
    reference: MoleculeRef
    evidence: PreparedState
    conformers: tuple[ConformerMember, ...] = Field(max_length=16)


class MolecularStateSet(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    source_job: UUID
    source: MoleculeRef
    options: StateOptions
    versions: dict[str, str]
    members: tuple[StateMember, ...] = Field(min_length=1, max_length=64)
    geometry_frame: Literal["unbound_conformer"] = "unbound_conformer"
    created_at: str


class StateSets:
    def __init__(self, store, assets):
        self.store, self.assets = store, assets
        self.scientific = ScientificStore(store, assets)
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_state_sets(id TEXT PRIMARY KEY,"
                "source_job TEXT UNIQUE NOT NULL,body TEXT NOT NULL,sha256 TEXT NOT NULL,"
                "created_at TEXT NOT NULL)"
            )

    def ingest(self, job, output):
        document = output / "result.json"
        if document.is_symlink() or document.stat().st_size > 2 * 1024**2:
            raise ValueError("State-set evidence is unsafe or oversized.")
        result = validate_result(json.loads(document.read_text()), job.request, output)
        versions = []
        for offset in range(0, 1000, 200):
            page = self.scientific.list(200, offset, source_job=job.id)
            versions.extend(page)
            if len(page) < 200:
                break
        pool = {
            (v.reference.sha256, v.reference.record): v.reference
            for v in versions
            if v.kind == "molecule"
        }

        def reference(name, record):
            ref = pool.get((result.artifact_sha256[name], record))
            if ref is None:
                raise ValueError(
                    "Prepared collection cannot register before all molecular records are indexed."
                )
            self.scientific.validate_reference(ref)
            return ref

        members = [
            StateMember(
                reference=reference(result.state_artifact, row.index),
                evidence=row,
                conformers=tuple(
                    ConformerMember(
                        reference=reference(result.conformer_artifact, c.record), evidence=c
                    )
                    for c in result.conformers
                    if c.state_index == row.index
                ),
            )
            for row in result.states
        ]
        identifier = str(uuid5(NAMESPACE, job.id))
        with self.store.connect() as db:
            old = db.execute(
                "SELECT * FROM research_state_sets WHERE source_job=?", (job.id,)
            ).fetchone()
            stamp = old["created_at"] if old else now()
            record = MolecularStateSet(
                id=identifier,
                source_job=job.id,
                source=result.source,
                options=result.options,
                versions=result.versions,
                members=tuple(members),
                created_at=stamp,
            )
            body = record.model_dump_json()
            checksum = hashlib.sha256(body.encode()).hexdigest()
            if old:
                if old["body"] != body or old["sha256"] != checksum:
                    raise ConflictError(
                        "Prepared state collection differs from its immutable indexed evidence."
                    )
            else:
                db.execute(
                    "INSERT INTO research_state_sets VALUES(?,?,?,?,?)",
                    (identifier, job.id, body, checksum, stamp),
                )
        return record

    def list(self, limit=100, offset=0, source_job=None):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_state_sets "
                + ("WHERE source_job=? " if source_job else "")
                + "ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (str(source_job), limit, offset) if source_job else (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Stored molecular collection failed integrity verification.")
        return MolecularStateSet.model_validate_json(row["body"])

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_state_sets WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Molecular state collection not found.")
        return self.decode(row)
