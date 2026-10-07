"""Compound records share the platform CSRF boundary and existing workflow start/control API."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query

from ..store import ConflictError
from .clustering_routes import register_clustering
from .collections import PoseSets
from .comparison_routes import register_score_comparisons
from .contracts import ExplorationInput
from .models import ExplorationPlan, PoseEnsemble
from .storage import Explorations


def register_pose_explorations(app, store, assets, settings, mutation):
    explorations = Explorations(store, assets, settings)
    sets = PoseSets(store, assets, settings)

    def translate(fn):
        try:
            return fn()
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(
                422, "Scientific source files are unavailable; restore or select them again."
            ) from exc

    @app.post(
        "/api/research/pose-explorations",
        response_model=ExplorationPlan,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    def create(value: ExplorationInput, idempotency_key: Annotated[UUID, Header()]):
        return translate(lambda: explorations.save(value, idempotency_key))

    @app.get("/api/research/pose-explorations", response_model=list[ExplorationPlan])
    def list_plans(
        limit: int = Query(100, ge=1, le=200),
        offset: int = Query(0, ge=0),
        site_set_id: UUID | None = None,
    ):
        return translate(lambda: explorations.list(limit, offset, site_set_id))

    @app.get("/api/research/pose-explorations/{exploration_id}", response_model=ExplorationPlan)
    def get_plan(exploration_id: UUID):
        return translate(lambda: explorations.get(exploration_id))

    @app.post(
        "/api/research/pose-explorations/{exploration_id}/runs/{run_id}/capture",
        response_model=PoseEnsemble,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    def capture(exploration_id: UUID, run_id: UUID):
        return translate(lambda: sets.capture(exploration_id, run_id))

    @app.get("/api/research/pose-ensembles", response_model=list[PoseEnsemble])
    def list_sets(
        limit: int = Query(100, ge=1, le=200),
        offset: int = Query(0, ge=0),
        exploration_id: UUID | None = None,
    ):
        return translate(lambda: sets.list(limit, offset, exploration_id))

    @app.get("/api/research/pose-ensembles/{set_id}", response_model=PoseEnsemble)
    def get_set(set_id: UUID):
        return translate(lambda: sets.get(set_id))

    register_score_comparisons(app, sets, mutation, translate)
    register_clustering(app, sets, mutation, translate)
