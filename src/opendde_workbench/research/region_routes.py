"""Saved native selections are immutable and share the normal mutation boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query

from ..store import ConflictError
from .regions import RegionInput, RegionRecords


def register_regions(app, store, assets, settings, mutation):
    records = RegionRecords(store, assets, settings)

    def execute(fn):
        try:
            return fn()
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/research/regions")
    def listing(limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0, le=10000)):
        return execute(lambda: records.list(limit, offset))

    @app.get("/api/research/regions/{region_id}")
    def detail(region_id: UUID):
        return execute(lambda: records.get(region_id))

    @app.post("/api/research/regions", status_code=201, dependencies=[Depends(mutation)])
    def save(value: RegionInput, idempotency_key: Annotated[UUID, Header()]):
        return execute(lambda: records.save(value, idempotency_key))

    return records
