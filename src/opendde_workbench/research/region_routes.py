"""Saved native selections are immutable and share the normal mutation boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query

from ..scientific_objects import MoleculeRef
from ..store import ConflictError
from .regions import REGION_ROLES, RegionInput, RegionRecords


def register_regions(app, store, assets, settings, mutation):
    records = RegionRecords(store, assets, settings)

    def execute(fn):
        try:
            return fn()
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(
                422,
                "Native identity evidence could not be read. "
                "Check the task and retry reading its result.",
            ) from exc

    @app.get("/api/research/regions/schema")
    def schema():
        return {
            "schema_version": 1,
            "roles": REGION_ROLES,
            "input": RegionInput.model_json_schema(),
        }

    @app.get("/api/research/regions")
    def listing(
        limit: int = Query(100, ge=1, le=200),
        offset: int = Query(0, ge=0, le=10000),
        asset_id: UUID | None = None,
        record: int = Query(0, ge=0, le=499),
        conformer: int = Query(0, ge=0, le=999),
        version_id: UUID | None = None,
    ):
        def load():
            if not asset_id:
                if version_id or record or conformer:
                    raise ValueError("A version/record filter requires its asset.")
                return records.list(limit, offset)
            asset = assets.get(asset_id)
            subject = MoleculeRef(
                asset_id=asset_id,
                sha256=asset.sha256,
                record=record,
                conformer=conformer,
                version_id=version_id,
            )
            return records.list(limit, offset, subject)

        return execute(load)

    @app.get("/api/research/regions/{region_id}")
    def detail(region_id: UUID):
        return execute(lambda: records.get(region_id))

    @app.post("/api/research/regions", status_code=201, dependencies=[Depends(mutation)])
    def save(value: RegionInput, idempotency_key: Annotated[UUID, Header()]):
        return execute(lambda: records.save(value, idempotency_key))

    return records
