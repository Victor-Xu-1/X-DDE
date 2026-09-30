"""Public scientific asset versions and lineage; mutations share the existing CSRF boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query

from ..store import ConflictError
from .contracts import ScientificObject, VersionInput
from .graph import graph
from .storage import ScientificStore


def register_research(app, store, assets, mutation):
    scientific = ScientificStore(store, assets)

    @app.get("/api/research/objects", response_model=list[ScientificObject])
    def objects(
        limit: int = Query(default=100, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        source_job: UUID | None = None,
    ):
        return scientific.list(limit, offset, source_job)

    @app.get("/api/research/objects/{object_id}", response_model=ScientificObject)
    def object_version(object_id: UUID):
        try:
            return scientific.get(object_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post(
        "/api/research/objects",
        response_model=ScientificObject,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    def create_version(value: VersionInput, idempotency_key: Annotated[UUID, Header()]):
        try:
            return scientific.create(value, idempotency_key)
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, KeyError, FileNotFoundError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/research/graph")
    def relationships(
        limit: int = Query(default=200, ge=1, le=200),
        focus: str | None = Query(default=None, max_length=50),
    ):
        try:
            return graph(store, limit=limit, focus=focus)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc

    return scientific
