"""Same-origin draft edits never enqueue jobs or start scientific environments."""

from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query

from ..store import CapacityError, ConflictError, Store
from .models import ArchiveInput, Draft, DraftInput, DraftSummary
from .storage import DraftStore


def register_drafts(app: FastAPI, store: Store, mutation):
    drafts = DraftStore(store)

    @app.get("/api/prediction-drafts", response_model=list[DraftSummary])
    def list_drafts(archived: bool = False, offset: int = Query(default=0, ge=0, le=1000000)):
        return drafts.list(archived, offset)

    @app.get("/api/prediction-drafts/{identifier}", response_model=Draft)
    def get_draft(identifier: UUID):
        result = drafts.get(str(identifier))
        if result is None:
            raise HTTPException(404, "Draft not found.")
        return result

    def error(exc):
        code = 404 if isinstance(exc, KeyError) else 429 if isinstance(exc, CapacityError) else 409
        return HTTPException(code if not isinstance(exc, ValueError) else 422, str(exc))

    @app.put(
        "/api/prediction-drafts/{identifier}",
        response_model=Draft,
        dependencies=[Depends(mutation)],
    )
    def save_draft(identifier: UUID, value: DraftInput):
        try:
            return drafts.save(str(identifier), value)
        except (ConflictError, CapacityError, ValueError) as exc:
            raise error(exc) from exc

    @app.post(
        "/api/prediction-drafts/{identifier}/archive",
        response_model=Draft,
        dependencies=[Depends(mutation)],
    )
    def archive_draft(identifier: UUID, value: ArchiveInput):
        try:
            return drafts.archive(str(identifier), value.revision, value.archived)
        except (KeyError, ConflictError, CapacityError) as exc:
            raise error(exc) from exc
