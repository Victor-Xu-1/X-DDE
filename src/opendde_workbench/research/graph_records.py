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
}


def project_record(store, kind, row):
    identifier = kind + ":" + row["id"]
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
