"""Compile comparison identity from trusted frozen plans, never client score claims."""

import hashlib
import json

from ..docking.contract import DockingTask
from ..workflows.contracts import PlanInput
from .ranking import ScoreCandidate


def comparison_inputs(request, collection, exploration, plan):
    if collection.id != request.pose_set_id or collection.exploration_id != exploration.id:
        raise ValueError("Selected collection differs from the frozen exploration source.")
    if plan["sha256"] != exploration.plan_sha256:
        raise ValueError("The exploration plan changed after native evidence was captured.")
    steps = {s.id: s.request for s in PlanInput.model_validate(plan["body"]).steps}
    poses = {
        (o.combination.step_id, p.evidence.record): (o, p)
        for o in collection.outcomes
        for p in o.poses
    }
    candidates, conditions, sources = [], {}, {}
    for selected in request.selections:
        key = (selected.step_id, selected.record)
        source = poses.get(key)
        if source is None:
            raise ValueError("Selected native pose is absent from this saved collection.")
        outcome, pose = source
        native = steps.get(selected.step_id)
        if (
            outcome.status != "succeeded"
            or not pose.reference
            or not pose.evidence.valid
            or not isinstance(native, DockingTask)
            or native.mode != "dock"
            or native.receptor != outcome.combination.receptor
            or native.ligand != outcome.combination.ligand.reference
            or native.options.seed != outcome.combination.seed
        ):
            raise ValueError(
                "Only exact qualified dock poses with their frozen inputs can be compared."
            )
        ligand = outcome.combination.ligand
        chemical = (
            {"state_set_id": str(ligand.state_set_id), "state_index": ligand.state_index}
            if ligand.state_set_id
            else ligand.reference.model_dump(mode="json")
        )
        condition = {
            "site_set_id": str(exploration.request.site_set_id),
            "site_id": outcome.combination.site_id,
            "receptor": native.receptor.model_dump(mode="json"),
            "chemical_source": chemical,
            "native_smiles": pose.evidence.smiles,
            "mode": native.mode,
            "search": native.search.model_dump(mode="json") if native.search else None,
            "options": native.options.model_dump(mode="json", exclude={"seed"}),
            "constraints": native.constraints.model_dump(mode="json")
            if native.constraints
            else None,
            "software_version": outcome.software_version,
            "binary_sha256": outcome.binary_sha256,
            "parser": outcome.parser,
            "initializations_are_variables": True,
        }
        digest = hashlib.sha256(
            json.dumps(condition, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        ).hexdigest()
        candidates.append(ScoreCandidate(key, digest, pose.evidence.scores))
        conditions[digest], sources[key] = condition, pose
    return tuple(candidates), conditions, sources
