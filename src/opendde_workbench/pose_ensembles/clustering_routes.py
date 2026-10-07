"""Clustering preparation is read-only; the normal job API alone enqueues computation."""

from uuid import UUID

from fastapi import Depends

from ..chemistry.cluster_contract import PoseClusterTask
from .clustering_sources import ClusteringInput, compile_clustering


def register_clustering(app, sets, mutation, translate):
    @app.post(
        "/api/research/pose-ensembles/{set_id}/clustering-request",
        response_model=PoseClusterTask,
        dependencies=[Depends(mutation)],
    )
    def prepare(set_id: UUID, value: ClusteringInput):
        return translate(lambda: compile_clustering(sets, set_id, value))
