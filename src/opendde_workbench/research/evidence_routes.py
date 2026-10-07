"""Evidence preview, immutable import and export share the standard CSRF boundary."""

import hashlib
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query
from fastapi.responses import Response

from ..store import ConflictError
from .evidence_contracts import EvidenceInput
from .evidence_export import export_csv, public_document
from .evidence_records import EvidenceRecords


def register_evidence(app, store, assets, mutation):
    records = EvidenceRecords(store, assets)

    def execute(fn):
        try:
            return fn()
        except (FileNotFoundError, KeyError) as exc:
            raise HTTPException(404, str(exc)) from exc
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(
                422, "Experimental evidence could not be validated: " + str(exc)
            ) from exc

    @app.get("/api/research/evidence/inputs/{asset_id}")
    def input_columns(asset_id: UUID, delimiter: Literal[",", "\t", ";"] = ","):
        def load():
            from .evidence_parse import MAX_BYTES, csv_reader

            asset = assets.get(asset_id)
            if asset.kind != "measurements" or not 0 < asset.size <= MAX_BYTES:
                raise ValueError("Select a bounded experimental CSV table.")
            content = assets.path(asset).read_bytes()
            if len(content) != asset.size or hashlib.sha256(content).hexdigest() != asset.sha256:
                raise ValueError("Experimental source file integrity changed.")
            return {
                "asset": asset.model_dump(mode="json"),
                "columns": csv_reader(content, delimiter).fieldnames,
            }

        return execute(load)

    @app.get("/api/research/evidence/schema")
    def schema():
        return {"schema_version": 1, "input": EvidenceInput.model_json_schema(), "max_rows": 1000}

    @app.post("/api/research/evidence/preview", dependencies=[Depends(mutation)])
    def preview(value: EvidenceInput):
        def load():
            rows = records.preview(value)
            return {
                "total": len(rows),
                "observations": [row.model_dump(mode="json") for row in rows],
                "linked": sum(row.molecule is not None for row in rows),
            }

        return execute(load)

    @app.post("/api/research/evidence", status_code=201, dependencies=[Depends(mutation)])
    def save(value: EvidenceInput, idempotency_key: Annotated[UUID, Header()]):
        return execute(lambda: public_document(records.save(value, idempotency_key)))

    @app.get("/api/research/evidence")
    def listing(limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0, le=100000)):
        return execute(
            lambda: [
                {
                    "id": str(row.id),
                    "name": row.request.name,
                    "observations": len(row.observations),
                    "target": row.request.conditions.target,
                    "endpoint": row.request.endpoint,
                    "created_at": row.created_at,
                }
                for row in records.list(limit, offset)
            ]
        )

    @app.get("/api/research/evidence/{identifier}")
    def detail(identifier: UUID):
        return execute(lambda: public_document(records.get(identifier)))

    @app.get("/api/research/evidence/{identifier}/download")
    def download(identifier: UUID):
        return execute(
            lambda: Response(
                export_csv(records.get(identifier)),
                media_type="text/csv",
                headers={
                    "Content-Disposition": 'attachment; filename="experimental-observations.csv"'
                },
            )
        )

    return records
