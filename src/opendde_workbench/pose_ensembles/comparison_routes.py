"""Derived score comparisons share existing platform mutation and source boundaries."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Query

from .comparisons import ScoreComparisons
from .score_contracts import ScoreComparison, ScoreComparisonInput


def register_score_comparisons(app, sets, mutation, translate):
    records = ScoreComparisons(sets)

    @app.post(
        "/api/research/pose-score-comparisons",
        response_model=ScoreComparison,
        status_code=201,
        dependencies=[Depends(mutation)],
    )
    def create(value: ScoreComparisonInput, idempotency_key: Annotated[UUID, Header()]):
        return translate(lambda: records.save(value, idempotency_key))

    @app.get("/api/research/pose-score-comparisons", response_model=list[ScoreComparison])
    def list_records(
        limit: int = Query(100, ge=1, le=200),
        offset: int = Query(0, ge=0),
        pose_set_id: UUID | None = None,
    ):
        return translate(lambda: records.list(limit, offset, pose_set_id))

    @app.get("/api/research/pose-score-comparisons/{comparison_id}", response_model=ScoreComparison)
    def get_record(comparison_id: UUID):
        return translate(lambda: records.get(comparison_id))
