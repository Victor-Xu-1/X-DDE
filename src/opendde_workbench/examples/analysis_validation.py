"""Fixed follow-up analyses must use the exact verified parent-case inputs."""

from ..assets import AssetStore
from ..pose_ensembles.clustering_sources import ClusteringInput, compile_clustering
from ..pose_ensembles.collections import PoseSets


def validate_analysis(job, prepared, store):
    parent = prepared.source_record
    if (
        prepared.module.capability_id != "pose.cluster"
        or prepared.module.parent_capability != "pose_exploration"
        or job.request.operation != "pose_cluster"
        or not parent
        or parent.get("kind") != "pose_exploration"
        or len(parent.get("poses", [])) != 1
        or str(job.request.pose_set_id) != parent["poses"][0]["id"]
    ):
        raise ValueError("The analysis does not belong to this exact fixed parent example.")
    assets = AssetStore(store, store.path.parent / "assets")
    request = job.request
    expected = compile_clustering(
        PoseSets(store, assets, None),
        request.pose_set_id,
        ClusteringInput(
            name=request.name,
            project_id=request.project_id,
            selections=tuple(row.selection for row in request.poses),
            options=request.options,
        ),
    )
    if expected != request:
        raise ValueError(
            "The fixed analysis must retain the complete verified native/frame inputs."
        )
