"""Project typed persisted records into graph nodes and factual relationships."""

from ..requests import input_identifiers
from .contracts import ScientificObject

TABLES = {
    "asset": "assets",
    "object": "scientific_objects",
    "task": "jobs",
    "plan": "workflow_plans",
    "run": "workflow_runs",
}


def project_record(store, kind, row):
    identifier = kind + ":" + row["id"]
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
    if kind == "plan":
        from ..workflows.contracts import PlanInput

        plan = PlanInput.model_validate_json(row["body"])
        edges = []
        for step in plan.steps:
            edges.extend(
                ("asset:" + value, identifier, "planned_input")
                for value in input_identifiers(step.request)
            )
            refs = list(step.request.scientific_inputs)
            if step.request.operation == "diffsbdd":
                from ..diffsbdd.contract import references

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
    if job.request.operation == "diffsbdd":
        from ..diffsbdd.contract import references

        refs.extend(ref for _, ref in references(job.request))
    edges.extend(
        ("object:" + str(ref.version_id), identifier, "used_as_input")
        for ref in refs
        if ref.version_id
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
