"""Small derived-evidence API uses the existing mutation and idempotency boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query

from ..models import Job
from ..store import ConflictError
from .contracts import BindingSiteSet, SiteInput
from .storage import SiteSets


def register_sites(app, store, assets, settings, mutation):
    sites = SiteSets(store, assets, settings)

    @app.get("/api/research/receptor-ensembles/{ensemble_id}/pocket-jobs", response_model=list[Job])
    def source_jobs(
        ensemble_id: UUID,
        limit: int = Query(default=200, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ):
        try:
            return sites.sources(ensemble_id, limit, offset)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post(
        "/api/research/site-sets",
        response_model=BindingSiteSet,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    def create(value: SiteInput, idempotency_key: Annotated[UUID, Header()]):
        try:
            return sites.save(value, idempotency_key)
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(422, "A selected scientific source no longer exists.") from exc
        except (ValueError, FileNotFoundError) as exc:
            message = (
                str(exc)
                if isinstance(exc, ValueError)
                else (
                    "Scientific source files are missing. "
                    "Re-run the source task before association."
                )
            )
            raise HTTPException(422, message) from exc

    @app.get("/api/research/site-sets", response_model=list[BindingSiteSet])
    def list_sets(
        limit: int = Query(default=100, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        ensemble_id: UUID | None = None,
    ):
        try:
            return sites.list(limit, offset, ensemble_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/research/site-sets/{set_id}", response_model=BindingSiteSet)
    def get_set(set_id: UUID):
        try:
            return sites.get(set_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
