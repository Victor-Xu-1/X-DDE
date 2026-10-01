"""Project typed persisted records into graph nodes and factual relationships."""

from ..requests import input_identifiers
from .contracts import ScientificObject

TABLES = {
    "asset": "assets",
    "object": "scientific_objects",
    "task": "jobs",
    "plan": "workflow_plans",
    "run": "workflow_runs",
    "region": "research_regions",
    "constraint": "research_constraints",
    "state_set": "research_state_sets",
    "receptor_set": "research_receptor_sets",
    "site_set": "research_site_sets",
    "exploration": "research_pose_explorations",
    "pose_set": "research_pose_sets",
    "score_set": "research_pose_comparisons",
}


def project_record(store, kind, row):
    identifier = kind + ":" + row["id"]
    if kind == "score_set":
        from ..pose_ensembles.comparisons import ScoreComparisons

        value = ScoreComparisons.decode(row)
        edges = [
            ("pose_set:" + str(value.request.pose_set_id), identifier, "pose_score_comparison")
        ]
        edges.extend(
            ("object:" + str(p.reference.version_id), identifier, "compared_pose")
            for group in value.groups
            for p in group.poses
        )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "pose_score_comparison",
                "label": "姿势评分比较",
                "exploration_id": str(value.exploration_id),
                "pose_set_id": str(value.request.pose_set_id),
                "score_comparison_id": str(value.id),
                "created_at": value.created_at,
                "source": {
                    "type": "api",
                    "path": "/api/research/pose-score-comparisons/" + str(value.id),
                },
            },
            edges,
        )
    if kind == "exploration":
        from ..pose_ensembles.storage import Explorations

        value = Explorations.decode(row)
        edges = [
            ("site_set:" + str(value.request.site_set_id), identifier, "pose_site_selection"),
            (identifier, "plan:" + str(value.plan_id), "planned_pose_exploration"),
        ]
        for ligand in value.request.ligands:
            edges.append(
                ("object:" + str(ligand.reference.version_id), identifier, "pose_ligand_input")
            )
            if ligand.state_set_id:
                edges.append(
                    ("state_set:" + str(ligand.state_set_id), identifier, "pose_state_input")
                )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "pose_exploration",
                "label": value.request.name,
                "exploration_id": str(value.id),
                "plan_id": str(value.plan_id),
            },
            edges,
        )
    if kind == "pose_set":
        from ..pose_ensembles.collections import PoseSets

        value = PoseSets.decode(row)
        edges = [
            ("exploration:" + str(value.exploration_id), identifier, "captured_pose_exploration"),
            ("run:" + str(value.run_id), identifier, "native_pose_evidence"),
        ]
        for outcome in value.outcomes:
            if outcome.job_id:
                edges.append(("task:" + str(outcome.job_id), identifier, "pose_attempt"))
            edges.extend(
                (identifier, "object:" + str(p.reference.version_id), "contains")
                for p in outcome.poses
                if p.reference and p.reference.version_id
            )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "pose_ensemble",
                "label": "Pose ensemble · " + str(value.id)[:8],
                "pose_set_id": str(value.id),
                "exploration_id": str(value.exploration_id),
            },
            edges,
        )
    if kind == "site_set":
        from ..sites.storage import SiteSets

        value = SiteSets.decode(row)
        edges = [("receptor_set:" + str(value.request.ensemble_id), identifier, "site_association")]
        edges.extend(
            ("task:" + str(o.source_job), identifier, "pocket_evidence") for o in value.observations
        )
        edges.extend(
            ("object:" + str(o.protein.version_id), identifier, "aligned_site_context")
            for o in value.observations
            if o.protein.version_id
        )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "binding_site_set",
                "job_id": str(value.alignment_job),
                "label": value.request.name,
                "collection": value.model_dump(mode="json"),
            },
            edges,
        )
    if kind == "receptor_set":
        from .receptor_sets import ReceptorSets

        value = ReceptorSets.decode(row)
        edges = [("task:" + str(value.source_job), identifier, "produced_collection")]
        edges.extend(
            ("asset:" + str(item.structure.asset_id), identifier, "aligned_from")
            for item in value.inputs
        )
        edges.extend(
            (identifier, "object:" + str(m.reference.version_id), "contains")
            for m in value.members
            if m.reference and m.reference.version_id
        )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "receptor_ensemble",
                "job_id": str(value.source_job),
                "label": "Receptor ensemble · " + str(value.id)[:8],
                "collection": value.model_dump(mode="json"),
            },
            edges,
        )
    if kind == "state_set":
        from .state_sets import StateSets

        value = StateSets.decode(row)
        edges = [
            ("task:" + str(value.source_job), identifier, "produced_collection"),
            ("asset:" + str(value.source.asset_id), identifier, "prepared_from"),
        ]
        refs = [member.reference for member in value.members] + [
            c.reference for member in value.members for c in member.conformers
        ]
        edges.extend(
            (identifier, "object:" + str(ref.version_id), "contains")
            for ref in refs
            if ref.version_id
        )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "molecular_state_set",
                "job_id": str(value.source_job),
                "label": "Molecular states · " + str(value.id)[:8],
                "collection": value.model_dump(mode="json"),
            },
            edges,
        )
    if kind == "asset":
        return (
            identifier,
            {
                "id": identifier,
                "kind": "file",
                "label": row["name"],
                "asset_id": row["id"],
                "format": row["suffix"],
                "asset_kind": row["kind"],
            },
            [],
        )
    if kind == "object":
        obj = ScientificObject.model_validate_json(row["body"])
        edges = [("asset:" + str(obj.reference.asset_id), identifier, "represented_by")]
        if obj.parent_id:
            edges.append(("object:" + str(obj.parent_id), identifier, obj.relation))
        if obj.source_job:
            edges.append(("task:" + str(obj.source_job), identifier, "produced"))
        return (
            identifier,
            {
                "id": identifier,
                "kind": obj.kind,
                "label": obj.label,
                "object": obj.model_dump(mode="json"),
            },
            edges,
        )
    if kind == "region":
        from .regions import RegionInput

        value = RegionInput.model_validate_json(row["body"])
        source = (
            "object:" + str(value.subject.version_id)
            if value.subject.version_id
            else "asset:" + str(value.subject.asset_id)
        )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "region",
                "label": value.name,
                "region_document": value.model_dump(mode="json"),
            },
            [
                (source, identifier, "selected_region"),
                ("task:" + str(value.identity_job), identifier, "identity_evidence"),
            ]
            + (
                [("region:" + str(value.parent_id), identifier, "revised_regions")]
                if value.parent_id
                else []
            ),
        )
    if kind == "constraint":
        from .constraint_contract import ConstraintSet

        value = ConstraintSet.model_validate_json(row["body"])
        refs = [value.subject] + ([value.frame.reference] if value.frame else [])
        edges = [
            (
                "object:" + str(ref.version_id) if ref.version_id else "asset:" + str(ref.asset_id),
                identifier,
                "constrained_input",
            )
            for ref in refs
        ]
        edges.extend(
            ("region:" + str(c.region_id), identifier, "constraint_selection")
            for c in value.conditions
            if c.kind == "fixed_region"
        )
        if value.parent_id:
            edges.append(("constraint:" + str(value.parent_id), identifier, "revised_conditions"))
        return identifier, {"id": identifier, "kind": "constraint", "label": value.name}, edges
    if kind == "plan":
        from ..workflows.contracts import PlanInput

        plan = PlanInput.model_validate_json(row["body"])
        edges = []
        for step in plan.steps:
            if step.request.constraints:
                edges.append(
                    (
                        "constraint:" + str(step.request.constraints.id),
                        identifier,
                        "planned_conditions",
                    )
                )
            edges.extend(
                ("asset:" + value, identifier, "planned_input")
                for value in input_identifiers(step.request)
            )
            refs = list(step.request.scientific_inputs)
            if step.request.operation == "diffsbdd":
                from ..diffsbdd.contract import references

                refs.extend(ref for _, ref in references(step.request))
            if step.request.operation == "receptor_ensemble":
                refs.extend(item.structure for item in step.request.inputs)
            if step.request.operation == "molecular_states":
                refs.append(step.request.molecule)
            if step.request.operation == "docking":
                from ..docking.contract import references

                refs.extend(ref for _, ref in references(step.request))
            edges.extend(
                ("object:" + str(ref.version_id), identifier, "planned_input")
                for ref in refs
                if ref.version_id
            )
        return identifier, {"id": identifier, "kind": "plan", "label": plan.name}, edges
    if kind == "run":
        with store.connect() as db:
            attempts = db.execute(
                "SELECT step_id,job_id FROM workflow_attempts WHERE run_id=?", (row["id"],)
            ).fetchall()
        edges = [("plan:" + row["plan_id"], identifier, "executed_as")]
        edges.extend(
            (identifier, "task:" + attempt["job_id"], "executed_step") for attempt in attempts
        )
        return (
            identifier,
            {
                "id": identifier,
                "kind": "run",
                "label": "Research run · " + row["id"][:8],
                "status": row["state"],
            },
            edges,
        )
    job = store.decode(row)
    edges = [
        ("asset:" + value, identifier, "used_as_input") for value in input_identifiers(job.request)
    ]
    refs = list(job.request.scientific_inputs)
    if job.request.operation == "docking":
        from ..docking.contract import references

        refs.extend(ref for _, ref in references(job.request))
    if job.request.operation == "receptor_ensemble":
        refs.extend(item.structure for item in job.request.inputs)
    if job.request.operation == "molecular_states":
        refs.append(job.request.molecule)
    if job.request.operation == "pocket_search":
        refs.append(job.request.protein)
    if job.request.operation == "diffsbdd":
        from ..diffsbdd.contract import references

        refs.extend(ref for _, ref in references(job.request))
    edges.extend(
        ("object:" + str(ref.version_id), identifier, "used_as_input")
        for ref in refs
        if ref.version_id
    )
    if job.request.constraints:
        edges.append(
            ("constraint:" + str(job.request.constraints.id), identifier, "used_conditions")
        )
    if job.parent_id:
        edges.append(("task:" + job.parent_id, identifier, "continued_as"))
    return (
        identifier,
        {
            "id": identifier,
            "kind": "task",
            "label": job.request.name,
            "operation": job.request.operation,
            "status": job.status,
            "job_id": job.id,
        },
        edges,
    )
