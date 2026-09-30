"""Deterministic lineage projection over real versions, assets and persisted tasks."""

from ..requests import input_identifiers
from .contracts import ScientificObject


def graph(store, *, limit=200, focus=None):
    with store.connect() as db:
        versions = [
            ScientificObject.model_validate_json(row["body"])
            for row in db.execute(
                "SELECT body FROM scientific_objects ORDER BY created_at DESC,id LIMIT ?",
                (limit + 1,),
            )
        ]
        assets = [
            dict(row)
            for row in db.execute(
                "SELECT * FROM assets ORDER BY created_at DESC,id LIMIT ?", (limit + 1,)
            )
        ]
        jobs = [
            store.decode(row)
            for row in db.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC,id LIMIT ?", (limit + 1,)
            )
        ]
    nodes, edges = {}, []
    for asset in assets[:limit]:
        identifier = "asset:" + asset["id"]
        nodes[identifier] = {
            "id": identifier,
            "kind": "file",
            "label": asset["name"],
            "asset_id": asset["id"],
            "format": asset["suffix"],
            "asset_kind": asset["kind"],
        }
    for version in versions[:limit]:
        identifier = "object:" + str(version.id)
        nodes[identifier] = {
            "id": identifier,
            "kind": version.kind,
            "label": version.label,
            "object": version.model_dump(mode="json"),
        }
        edges.append(
            {
                "source": "asset:" + str(version.reference.asset_id),
                "target": identifier,
                "relation": "represented_by",
            }
        )
        if version.parent_id:
            edges.append(
                {
                    "source": "object:" + str(version.parent_id),
                    "target": identifier,
                    "relation": version.relation,
                }
            )
        if version.source_job:
            edges.append(
                {
                    "source": "task:" + str(version.source_job),
                    "target": identifier,
                    "relation": "produced",
                }
            )
    for job in jobs[:limit]:
        identifier = "task:" + job.id
        nodes[identifier] = {
            "id": identifier,
            "kind": "task",
            "label": job.request.name,
            "operation": job.request.operation,
            "status": job.status,
            "job_id": job.id,
        }
        for asset in input_identifiers(job.request):
            edges.append(
                {"source": "asset:" + asset, "target": identifier, "relation": "used_as_input"}
            )
        for ref in job.request.scientific_inputs:
            if ref.version_id:
                edges.append(
                    {
                        "source": "object:" + str(ref.version_id),
                        "target": identifier,
                        "relation": "used_as_input",
                    }
                )
        if job.parent_id:
            edges.append(
                {
                    "source": "task:" + job.parent_id,
                    "target": identifier,
                    "relation": "continued_as",
                }
            )
        if job.request.operation == "diffsbdd":
            from ..diffsbdd.contract import references

            for _, ref in references(job.request):
                if ref.version_id:
                    edges.append(
                        {
                            "source": "object:" + str(ref.version_id),
                            "target": identifier,
                            "relation": "used_as_input",
                        }
                    )
    # Include referenced ancestors even if a page of recent records excludes them.
    missing = {edge[side] for edge in edges for side in ("source", "target")} - nodes.keys()
    with store.connect() as db:
        for identifier in sorted(missing):
            kind, value = identifier.split(":", 1)
            table = {"asset": "assets", "task": "jobs", "object": "scientific_objects"}[kind]
            row = db.execute(f"SELECT * FROM {table} WHERE id=?", (value,)).fetchone()
            if row is None:
                continue
            if kind == "object":
                obj = ScientificObject.model_validate_json(row["body"])
                node = {"kind": obj.kind, "label": obj.label, "object": obj.model_dump(mode="json")}
            elif kind == "task":
                job = store.decode(row)
                node = {
                    "kind": "task",
                    "label": job.request.name,
                    "job_id": job.id,
                    "operation": job.request.operation,
                    "status": job.status,
                }
            else:
                node = {
                    "kind": "file",
                    "label": row["name"],
                    "asset_id": row["id"],
                    "format": row["suffix"],
                    "asset_kind": row["kind"],
                }
            nodes[identifier] = {"id": identifier, **node}
    edges = [edge for edge in edges if edge["source"] in nodes and edge["target"] in nodes]
    if focus:
        if focus not in nodes:
            raise KeyError("Requested relationship node is outside this page or does not exist.")
        connected = {focus}
        for edge in edges:
            if focus in (edge["source"], edge["target"]):
                connected.update((edge["source"], edge["target"]))
        nodes = {key: value for key, value in nodes.items() if key in connected}
        edges = [
            edge for edge in edges if edge["source"] in connected and edge["target"] in connected
        ]
    return {
        "schema": 1,
        "nodes": list(nodes.values()),
        "edges": edges,
        "truncated": max(len(assets), len(versions), len(jobs)) > limit,
        "limit": limit,
    }
