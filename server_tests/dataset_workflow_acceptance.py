"""An actual new-library -> six-fold index -> pocket retrieval -> docking run."""

import json
import time
from uuid import uuid4


def run_screening_chain(campaign, raw, materials, pocket):
    # Keep original bytes from four complex ChEMBL records; this is a bounded
    # independent workflow check, not a replacement public-library example.
    subset = b"$$$$".join(raw.split(b"$$$$")[:4]) + b"$$$$\n"
    library = campaign.material(subset, "public-four-complex-molecules.sdf", "library", "data")
    steps = []
    definitions = (
        ("prepare", "library_prepare", {"kind": "chemistry"}, [library], None, None),
        (
            "index",
            "drugclip_index",
            {
                "kind": "drugclip",
                "mode": "index",
                "use": "non_commercial",
                "batch_size": 4,
                "shard_rows": 10,
            },
            [],
            "prepare",
            "library",
        ),
        (
            "retrieve",
            "drugclip_retrieve",
            {
                "kind": "drugclip",
                "mode": "retrieve",
                "use": "non_commercial",
                "top_k": 4,
                "retain": 2,
                "shortlist": "diversity",
                "receptor": materials[0]["source"],
                "search": pocket,
                "alternate_locations": "highest_occupancy",
            },
            materials,
            "index",
            "index",
        ),
        (
            "dock",
            "screening_dock",
            {
                "kind": "gnina",
                "mode": "batch",
                "receptor": materials[0]["source"],
                "search": pocket,
                "alternate_locations": "highest_occupancy",
                "selected_ids": ["planned-candidates"],
                "docking": {
                    "cpu": 2,
                    "memory_mib": 8192,
                    "use_gpu": False,
                    "cnn_scoring": "none",
                    "exhaustiveness": 2,
                    "num_modes": 2,
                    "time_limit_seconds": 300,
                },
            },
            materials,
            "retrieve",
            "screening",
        ),
    )
    for identifier, operation, payload, inputs, previous, role in definitions:
        steps.append(
            {
                "id": identifier,
                "depends_on": [previous] if previous else [],
                "bindings": [],
                "data_bindings": [
                    {
                        "from_step": previous,
                        "slot": 0,
                        "role": role,
                        "select_candidates": identifier == "dock",
                    }
                ]
                if previous
                else [],
                "request": {
                    "operation": operation,
                    "name": "Public workflow " + identifier,
                    "inputs": inputs,
                    "scientific_inputs": [item["source"] for item in inputs],
                    "sources": [{"job_id": str(uuid4()), "report_sha256": "0" * 64, "role": role}]
                    if previous
                    else [],
                    "payload": payload,
                    "options": {"cpu": 2, "memory_mib": 8192},
                },
            }
        )
    response = campaign.client.post(
        "/api/workflows/plans",
        headers={"Idempotency-Key": str(uuid4())},
        json={
            "name": "Actual public screening pipeline",
            "steps": steps,
            "budget": {"max_jobs": 4, "wall_seconds": 1800},
        },
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    response = campaign.client.post(
        f"/api/workflows/plans/{plan['id']}/runs",
        headers={"Idempotency-Key": str(uuid4())},
        json={"plan_sha256": plan["sha256"]},
    )
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    until = time.monotonic() + 1800
    while time.monotonic() < until:
        run = campaign.client.get(f"/api/workflows/runs/{identifier}").json()
        if run["state"] in {"succeeded", "failed", "blocked", "cancelled"}:
            break
        time.sleep(0.3)
    diagnostics = {
        item["step_id"]: campaign.client.get(f"/api/jobs/{item['job_id']}/logs").json()
        for item in run["attempts"]
        if item["status"] != "succeeded"
    }
    assert run["state"] == "succeeded", {"run": run, "native_diagnostics": diagnostics}
    assert len(run["attempts"]) == 4 and all(
        item["status"] == "succeeded" for item in run["attempts"]
    )
    jobs = {
        item["step_id"]: campaign.client.get(f"/api/jobs/{item['job_id']}").json()
        for item in run["attempts"]
    }
    prepared = campaign.client.get(f"/api/jobs/{jobs['prepare']['id']}/result").json()
    encoded = campaign.client.get(f"/api/jobs/{jobs['index']['id']}/result").json()
    assert prepared["counts"]["unique_compounds"] == 4 and encoded["counts"]["indexed"] == 4
    retrieved = campaign.client.get(f"/api/jobs/{jobs['retrieve']['id']}/result").json()
    selected = [row["id"] for row in retrieved["candidates"] if row["artifact"]]
    assert jobs["dock"]["request"]["payload"]["selected_ids"] == selected and len(selected) == 2
    for step, previous in (("index", "prepare"), ("retrieve", "index"), ("dock", "retrieve")):
        source = jobs[step]["request"]["sources"][0]
        assert source["job_id"] == jobs[previous]["id"] and source["report_sha256"] != "0" * 64
    destination = campaign.root / "screening-workflow-receipt.json"
    destination.write_text(json.dumps({"run": run, "jobs": jobs}, indent=2))
