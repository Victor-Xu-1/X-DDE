"""Compile clustering inputs from exact saved poses, aligned receptors and frozen plans."""

import hashlib
from uuid import UUID

from pydantic import Field, model_validator

from ..chemistry.cluster_contract import ClusterPose, ClusterReceptor, PoseClusterTask
from ..chemistry.cluster_options import ClusterOptions
from ..research.receptor_sets import ReceptorSets
from ..scientific_objects import ScientificModel
from ..sites.storage import SiteSets
from .collections import PoseSets
from .comparison_sources import comparison_inputs
from .score_contracts import PoseSelector, ScoreComparisonInput


class ClusteringInput(ScientificModel):
    name: str = Field(default="Binding mode clustering", min_length=1, max_length=80)
    project_id: UUID | None = None
    selections: tuple[PoseSelector, ...] = Field(min_length=2, max_length=50)
    options: ClusterOptions = Field(default_factory=ClusterOptions)

    @model_validator(mode="after")
    def unique_poses(self):
        if len(set(self.selections)) != len(self.selections):
            raise ValueError("Select each exact pose only once.")
        return self


def digest(model):
    return hashlib.sha256(model.model_dump_json().encode()).hexdigest()


def compile_clustering(sets, identifier, value):
    collection = sets.get(identifier)
    exploration = sets.explorations.get(collection.exploration_id)
    plan = sets.explorations.workflows.plan(exploration.plan_id)
    _, _, sources = comparison_inputs(
        ScoreComparisonInput(pose_set_id=collection.id, selections=value.selections),
        collection,
        exploration,
        plan,
    )
    sites = SiteSets(sets.store, sets.assets, sets.settings).get(exploration.request.site_set_id)
    if digest(sites) != exploration.site_set_sha256:
        raise ValueError("Binding site evidence changed after pose exploration was planned.")
    ensemble = ReceptorSets(sets.store, sets.assets).get(sites.request.ensemble_id)
    reference_member = ensemble.members[ensemble.options.reference_index]
    if not reference_member.reference or sites.reference != reference_member.reference:
        raise ValueError("Site and receptor collections must share their exact reference frame.")
    if sites.alignment_job != ensemble.source_job:
        raise ValueError("Site evidence does not originate from this receptor alignment.")
    observations = {row.member_index: row for row in sites.observations}
    outcomes = {row.combination.step_id: row for row in collection.outcomes}
    rows, receptors = [], {}
    for selected in value.selections:
        outcome = outcomes[selected.step_id]
        index = outcome.combination.member_index
        if index >= len(ensemble.members):
            raise ValueError("Pose receptor member is absent from the aligned collection.")
        member = ensemble.members[index]
        observation = observations.get(index)
        if (
            member.evidence.index != index
            or not member.reference
            or observation is None
            or observation.protein != member.reference
            or outcome.combination.receptor != member.reference
            or not member.evidence.transformation
        ):
            raise ValueError("A pose is not paired with its verified aligned receptor.")
        if observation.protein_artifact != "protein.pdb":
            raise ValueError(
                "This clustering method needs explicitly prepared aligned PDB receptors."
            )
        transform = member.evidence.transformation
        receptors[index] = ClusterReceptor(
            member_index=index,
            reference=member.reference,
            residue_pairs=transform.residue_pairs,
            expected_alignment_rmsd_angstrom=transform.rmsd_angstrom,
        )
        rows.append(
            ClusterPose(
                selection=selected,
                reference=sources[(selected.step_id, selected.record)].reference,
                member_index=index,
            )
        )
    return PoseClusterTask(
        name=value.name,
        project_id=value.project_id,
        pose_set_id=collection.id,
        pose_set_sha256=digest(collection),
        site_set_sha256=digest(sites),
        receptor_set_id=ensemble.id,
        receptor_set_sha256=digest(ensemble),
        frame=reference_member.reference,
        receptors=tuple(receptors[i] for i in sorted(receptors)),
        poses=tuple(rows),
        options=value.options,
    )


def clustering_bindings(request, assets):
    from ..chemistry.cluster_contract import references
    from ..research.storage import ScientificStore

    expected = compile_clustering(
        PoseSets(assets.store, assets, None),
        request.pose_set_id,
        ClusteringInput(
            name=request.name,
            project_id=request.project_id,
            selections=tuple(row.selection for row in request.poses),
            options=request.options,
        ),
    )
    if expected != request:
        raise ValueError("Clustering inputs differ from the exact saved native/frame evidence.")
    scientific = ScientificStore(assets.store, assets)
    bound, total = {}, 0
    for role, ref in references(request):
        asset = assets.get(ref.asset_id)
        kind, suffix = ("structure", ".pdb") if role == "receptor" else ("ligand", ".sdf")
        if asset.kind != kind or asset.suffix != suffix or asset.sha256 != ref.sha256:
            raise ValueError("Choose exact aligned PDB receptors and individual SDF poses.")
        scientific.validate_reference(ref)
        if asset.id in bound:
            continue
        file = assets.path(asset)
        total += file.stat().st_size
        if total > 256 * 1024**2:
            raise ValueError("Clustering source files exceed the 256 MiB input budget.")
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != ref.sha256:
                raise ValueError("A clustering source file failed integrity verification.")
        bound[asset.id] = asset
    return bound
