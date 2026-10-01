"""Aligned receptor collections use immutable scientific versions in the existing Store."""

import hashlib
import json
from typing import Literal
from uuid import UUID, uuid5

from pydantic import Field, model_validator

from ..receptors.contract import ReceptorInput
from ..receptors.result import AlignedMember, validate_result
from ..receptors.selection import EnsembleOptions
from ..scientific_objects import MoleculeRef, ScientificModel
from ..store import ConflictError, now
from .storage import ScientificStore

NAMESPACE = UUID("69ae1b25-e17d-4a14-9f5e-eaac37e5b155")


class EnsembleMember(ScientificModel):
    reference: MoleculeRef | None
    evidence: AlignedMember

    @model_validator(mode="after")
    def qualified_reference(self):
        if (self.reference is None) != (self.evidence.status == "rejected"):
            raise ValueError("Only qualified receptor members can have an aligned asset reference.")
        if self.reference is not None and (
            self.reference.sha256 != self.evidence.artifact_sha256
            or self.reference.record
            or self.reference.conformer
        ):
            raise ValueError("Aligned receptor reference differs from its actual artifact.")
        return self


class ReceptorEnsemble(ScientificModel):
    schema_version: Literal[1] = 1
    id: UUID
    source_job: UUID
    inputs: tuple[ReceptorInput, ...] = Field(min_length=2, max_length=16)
    options: EnsembleOptions
    members: tuple[EnsembleMember, ...] = Field(min_length=2, max_length=16)
    versions: dict[str, str]
    coordinate_frame: Literal["selected_reference_structure"] = "selected_reference_structure"
    qualified_count: int = Field(ge=1, le=16)
    collection_status: Literal["aligned", "partial"]
    created_at: str


class ReceptorSets:
    def __init__(self, store, assets):
        self.store, self.assets = store, assets
        self.scientific = ScientificStore(store, assets)
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_receptor_sets(id TEXT PRIMARY KEY,"
                "source_job TEXT UNIQUE NOT NULL,body TEXT NOT NULL,sha256 TEXT NOT NULL,"
                "created_at TEXT NOT NULL)"
            )

    def ingest(self, job, output):
        document = output / "result.json"
        if document.is_symlink() or document.stat().st_size > 25 * 1024**2:
            raise ValueError("Receptor collection evidence is unsafe or oversized.")
        result = validate_result(json.loads(document.read_text()), job.request, output)
        pool = {
            (v.label, v.reference.sha256): v.reference
            for v in self.scientific.list(200, source_job=job.id)
            if v.kind == "structure"
        }
        members = []
        for row in result.members:
            reference = None
            if row.status != "rejected":
                reference = pool.get((row.artifact, row.artifact_sha256))
                if reference is None:
                    raise ValueError(
                        "Receptor collection cannot register before aligned artifacts are indexed."
                    )
                self.scientific.validate_reference(reference)
            members.append(EnsembleMember(reference=reference, evidence=row))
        identifier = str(uuid5(NAMESPACE, job.id))
        with self.store.connect() as db:
            old = db.execute(
                "SELECT * FROM research_receptor_sets WHERE source_job=?", (job.id,)
            ).fetchone()
            stamp = old["created_at"] if old else now()
            record = ReceptorEnsemble(
                id=identifier,
                source_job=job.id,
                inputs=result.inputs,
                options=result.options,
                members=tuple(members),
                versions=result.versions,
                qualified_count=result.qualified_count,
                collection_status=result.collection_status,
                created_at=stamp,
            )
            body = record.model_dump_json()
            checksum = hashlib.sha256(body.encode()).hexdigest()
            if old:
                if old["body"] != body or old["sha256"] != checksum:
                    raise ConflictError(
                        "Receptor collection differs from its immutable indexed evidence."
                    )
            else:
                db.execute(
                    "INSERT INTO research_receptor_sets VALUES(?,?,?,?,?)",
                    (identifier, job.id, body, checksum, stamp),
                )
        return record

    def list(self, limit=100, offset=0, source_job=None):
        with self.store.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_receptor_sets "
                + ("WHERE source_job=? " if source_job else "")
                + "ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (str(source_job), limit, offset) if source_job else (limit, offset),
            ).fetchall()
        return [self.decode(row) for row in rows]

    @staticmethod
    def decode(row):
        if hashlib.sha256(row["body"].encode()).hexdigest() != row["sha256"]:
            raise ValueError("Stored receptor collection failed integrity verification.")
        return ReceptorEnsemble.model_validate_json(row["body"])

    def get(self, identifier):
        with self.store.connect() as db:
            row = db.execute(
                "SELECT * FROM research_receptor_sets WHERE id=?", (str(identifier),)
            ).fetchone()
        if row is None:
            raise KeyError("Receptor ensemble not found.")
        return self.decode(row)
