"""Bounded, parameterized research table exploration through the existing job authority."""

import hashlib
import json
import sqlite3
import time
from uuid import UUID

from fastapi import HTTPException, Query

from ..artifacts import contained
from .contract import DatasetTask
from .result import validate_result
from .suppliers import catalogue


def register(app, store, settings):
    @app.get("/api/datasets/suppliers")
    def suppliers():
        return catalogue()

    def completed(job_id, *, full_hash=True):
        job = store.get(str(job_id))
        if job is None:
            raise HTTPException(404, "Research dataset task not found.")
        if job.status != "succeeded" or not isinstance(job.request, DatasetTask):
            raise HTTPException(409, "Choose a successfully completed scientific data task.")
        root = settings.state_dir / "jobs" / job.id / "output"
        file = contained(root, "result.json")
        if file.stat().st_size > 4 * 1024**2:
            raise HTTPException(422, "Scientific result summary exceeds its budget.")
        content = file.read_bytes()
        try:
            result = validate_result(json.loads(content), job.request, root, full_hash=full_hash)
        except (ValueError, OSError, KeyError) as exc:
            raise HTTPException(422, "Scientific data changed or failed verification.") from exc
        return job, root, result, hashlib.sha256(content).hexdigest()

    @app.get("/api/datasets/results")
    def results(role: str = Query(default="", max_length=20)):
        if role and role not in {
            "library",
            "index",
            "screening",
            "definition",
            "decoded",
            "counts",
            "analysis",
            "model",
        }:
            raise HTTPException(422, "Choose a supported research data role.")
        values = []
        # The bounded task store is the only catalogue; no parallel file/version database.
        for job in store.list_jobs(limit=100):
            if job.status == "succeeded" and isinstance(job.request, DatasetTask):
                _, _, result, digest = completed(job.id, full_hash=False)
                if not role or result.data_kind == role:
                    values.append(
                        {
                            "job_id": job.id,
                            "name": job.request.name,
                            "report_sha256": digest,
                            "role": result.data_kind,
                            "counts": result.counts,
                            "metadata": result.metadata,
                        }
                    )
        return values

    @app.get("/api/datasets/{job_id}/members")
    def members(
        job_id: UUID,
        limit: int = Query(default=30, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=100000000),
        search: str = Query(default="", max_length=120),
        order: str = Query(default="record", pattern="^(record|mw|logp|qed)$"),
    ):
        _, root, result, _ = completed(job_id)
        if result.data_kind != "library":
            raise HTTPException(422, "This result is not a prepared compound library.")
        file = contained(root, "library.sqlite")
        database = sqlite3.connect(file.as_uri() + "?mode=ro&immutable=1", uri=True)
        database.row_factory = sqlite3.Row
        try:
            database.execute("PRAGMA query_only=ON")
            database.execute("PRAGMA trusted_schema=OFF")
            deadline = time.monotonic() + 5
            database.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            pattern = (
                "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            )
            clause = (
                "WHERE c.smiles LIKE ? ESCAPE '\\' OR EXISTS "
                "(SELECT 1 FROM records r WHERE r.compound_id=c.id "
                "AND r.supplier_id LIKE ? ESCAPE '\\')"
                if search
                else ""
            )
            parameters = [pattern, pattern] if search else []
            sort = {
                "record": "c.source_record",
                "mw": "c.mw",
                "logp": "c.logp",
                "qed": "c.qed DESC",
            }[order]
            rows = database.execute(
                "SELECT c.id,c.smiles,c.mw,c.logp,c.tpsa,c.qed,c.hbd,c.hba,c.rotatable, "
                "c.source_record,c.supplier,(SELECT COUNT(*) FROM records r "
                "WHERE r.compound_id=c.id) offers FROM compounds c "
                + clause
                + " ORDER BY "
                + sort
                + ",c.id LIMIT ? OFFSET ?",
                (*parameters, limit, offset),
            ).fetchall()
            return {
                "rows": [dict(row) for row in rows],
                "offset": offset,
                "total": result.counts["unique_compounds"],
                "has_more": len(rows) == limit,
            }
        except sqlite3.Error as exc:
            raise HTTPException(
                422, "This library query exceeds its budget or the database is invalid."
            ) from exc
        finally:
            database.close()
