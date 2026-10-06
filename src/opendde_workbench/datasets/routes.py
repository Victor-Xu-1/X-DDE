"""Bounded, parameterized research table exploration through the existing job authority."""

import hashlib
import json
import sqlite3
import time
from uuid import UUID

from fastapi import HTTPException, Query

from ..artifacts import contained
from .bindings import SOURCE_ARTIFACT
from .contract import OPERATIONS, DatasetTask
from .result import RESULT_KINDS, validate_result
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

    from .exploration_routes import register as register_exploration

    register_exploration(app, completed)

    @app.get("/api/datasets/{job_id}/summary")
    def summary(job_id: UUID):
        job, _, result, digest = completed(job_id, full_hash=False)
        return {
            "job_id": job.id,
            "name": job.request.name,
            "operation": job.request.operation,
            "report_sha256": digest,
            "role": result.data_kind,
            "counts": result.counts,
            "metadata": result.metadata,
        }

    @app.get("/api/datasets/results")
    def results(
        role: str = Query(default="", max_length=20),
        search: str = Query(default="", max_length=120),
        offset: int = Query(default=0, ge=0, le=100000000),
        limit: int = Query(default=100, ge=1, le=200),
    ):
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
        # Filter the existing task authority before limiting; unrelated tasks cannot hide libraries.
        pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        operations = tuple(
            operation
            for operation in OPERATIONS
            if (not role or RESULT_KINDS[operation] == role)
            and (role != "analysis" or operation == "del_analyze")
        )
        with store.connect() as database:
            jobs = [
                store.decode(row)
                for row in database.execute(
                    "SELECT * FROM jobs WHERE status='succeeded' AND "
                    "json_extract(request,'$.operation') IN ("
                    + ",".join("?" for _ in operations)
                    + ") "
                    "AND json_extract(request,'$.name') LIKE ? ESCAPE '\\' "
                    "ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (*operations, pattern, limit, offset),
                )
            ]
        for job in jobs:
            if job.status == "succeeded" and isinstance(job.request, DatasetTask):
                _, _, result, digest = completed(job.id, full_hash=False)
                if not role or result.data_kind == role:
                    if role == "model" and result.metadata.get("model_contract") != 1:
                        continue
                    required = SOURCE_ARTIFACT.get(role)
                    if required and not any(item.role == required for item in result.artifacts):
                        continue
                    values.append(
                        {
                            "job_id": job.id,
                            "name": job.request.name,
                            "operation": job.request.operation,
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
                "c.source_record,c.supplier,(SELECT supplier_id FROM records r WHERE "
                "r.record=c.source_record) display_name,(SELECT COUNT(*) FROM records r "
                "WHERE r.compound_id=c.id) offers FROM compounds c "
                + clause
                + " ORDER BY "
                + sort
                + ",c.id LIMIT ? OFFSET ?",
                (*parameters, limit + 1, offset),
            ).fetchall()
            return {
                "rows": [dict(row) for row in rows[:limit]],
                "offset": offset,
                "total": result.counts["unique_compounds"],
                "has_more": len(rows) > limit,
            }
        except sqlite3.Error as exc:
            raise HTTPException(
                422, "This library query exceeds its budget or the database is invalid."
            ) from exc
        finally:
            database.close()

    @app.get("/api/datasets/{job_id}/table")
    def research_table(
        job_id: UUID,
        view: str = Query(pattern="^(enrichment|counts|series|followup)$"),
        comparison: str = Query(default="", max_length=64),
        limit: int = Query(default=30, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=100000000),
        search: str = Query(default="", max_length=120),
        prioritized: bool = False,
    ):
        _, root, result, _ = completed(job_id)
        file_and_role = {
            "enrichment": ("analysis.sqlite", "del_comparison_evidence"),
            "counts": ("counts.sqlite", "compound_count_matrix"),
            "series": ("series.sqlite", "del_series_counts"),
            "followup": ("followup.sqlite", "reported_followup_measurements"),
        }[view]
        file_name, role = file_and_role
        if not any(item.name == file_name and item.role == role for item in result.artifacts):
            raise HTTPException(
                422, "This result has no verified table of the selected research type."
            )
        database = sqlite3.connect(
            contained(root, file_name).as_uri() + "?mode=ro&immutable=1", uri=True
        )
        database.row_factory = sqlite3.Row
        try:
            database.execute("PRAGMA query_only=ON")
            database.execute("PRAGMA trusted_schema=OFF")
            deadline = time.monotonic() + 5
            database.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            values = []
            pattern = (
                "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            )
            if view == "enrichment":
                comparison = comparison or str(result.metadata.get("chosen_comparison", ""))
                if comparison not in {
                    row[0] for row in database.execute("SELECT id FROM comparisons")
                }:
                    raise HTTPException(422, "Choose an actually computed enrichment comparison.")
                query = (
                    "SELECT e.*,m.smiles,m.cycles,m.ordinal FROM enrichment e "
                    "JOIN members m ON m.id=e.member WHERE e.comparison=?"
                )
                values = [comparison]
                if search:
                    query += " AND e.member LIKE ? ESCAPE '\\'"
                    values.append(pattern)
                if prioritized:
                    query += " AND e.prioritizable=1"
                query += " ORDER BY e.score DESC,e.member"
                total = result.counts["observed_members"]
            elif view == "counts":
                query = "SELECT c.*,m.cycles,m.smiles FROM counts c JOIN members m ON m.id=c.member"
                if search:
                    query += " WHERE c.member LIKE ? ESCAPE '\\'"
                    values.append(pattern)
                query += " ORDER BY c.raw DESC,c.member,c.sample"
                total = result.counts["member_sample_pairs"]
            elif view == "series":
                query = "SELECT * FROM series ORDER BY score DESC,kind,block_a,block_b"
                total = result.counts["series"]
            else:
                query = "SELECT * FROM measurements ORDER BY record"
                total = result.counts["reported"]
            rows = database.execute(
                query + " LIMIT ? OFFSET ?", (*values, limit + 1, offset)
            ).fetchall()
            return {
                "rows": [dict(row) for row in rows[:limit]],
                "offset": offset,
                "total": total,
                "has_more": len(rows) > limit,
            }
        except sqlite3.Error as exc:
            raise HTTPException(
                422, "This research query exceeds its budget or its table is invalid."
            ) from exc
        finally:
            database.close()
