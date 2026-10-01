"""Same-run actual preparation/site evidence into new real GNINA workflow sampling."""

import json
import os
import shutil
import sqlite3
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4


def import_states(state, fixture):
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.models import Status
    from opendde_workbench.requests import TASK_ADAPTER
    from opendde_workbench.research.outputs import OutputCatalog
    from opendde_workbench.store import Store

    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    source = assets.save(
        "native-transferred-state-source.sdf", "ligand", (fixture / "input.sdf").read_bytes()
    )
    result = json.loads((fixture / "result.json").read_text())
    assert result["source"]["sha256"] == source.sha256
    result["source"] = {
        "asset_id": source.id,
        "sha256": source.sha256,
        "record": 0,
        "conformer": 0,
        "version_id": None,
    }
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "molecular_states",
            "name": "同运行原生状态结果转入",
            "molecule": result["source"],
            "options": result["options"],
        }
    )
    job = store.create(request, str(uuid4()), 20, 100)
    assert store.claim(expected_id=job.id).id == job.id
    store.finish(job.id, Status.SUCCEEDED)
    output = state / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    for name in (
        result["state_artifact"],
        result["conformer_artifact"],
        *(c["artifact"] for c in result["conformers"]),
    ):
        shutil.copyfile(fixture / name, output / name)
    (output / "result.json").write_text(json.dumps(result))
    assert OutputCatalog(store, assets).index(job, output)["state"] == "complete"
    return job.id


def inspect_pose_campaign(settings, image):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app

    source = Path(os.environ["WB_CORE_FIXTURE"])
    state = settings.state_dir.parent / "pose-acceptance-state"
    shutil.copytree(source / "site-association", state)
    original = json.loads((source / "site-association/acceptance.json").read_text())
    state_job = import_states(state, source / "molecular-states")
    target = replace(settings, state_dir=state, gnina_image=image)
    with TestClient(create_app(target), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        sites = client.get("/api/research/site-sets/" + original["site_set_id"]).json()
        prepared = client.get("/api/research/state-sets?source_job=" + state_job).json()[0]
        conformers = prepared["members"][0]["conformers"]
        assert len(conformers) == 2
        site_ids = [next(s["id"] for s in sites["sites"] if s["member_index"] == i) for i in (0, 1)]
        body = {
            "name": "真实多受体状态初始化探索",
            "site_set_id": sites["id"],
            "site_ids": site_ids,
            "ligands": [
                {
                    "reference": c["reference"],
                    "state_set_id": prepared["id"],
                    "state_index": 0,
                    "conformer_index": i,
                }
                for i, c in enumerate(conformers)
            ],
            "options": {
                "seed_count": 2,
                "max_jobs": 8,
                "wall_seconds": 3600,
                "docking": {
                    "cpu": 1,
                    "memory_mib": 2048,
                    "exhaustiveness": 1,
                    "num_modes": 2,
                    "time_limit_seconds": 120,
                    "cnn_scoring": "none",
                },
            },
        }
        response = client.post(
            "/api/research/pose-explorations", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        assert response.status_code == 201, response.text
        exploration = response.json()
        assert len(exploration["combinations"]) == 8
        before = len(client.get("/api/jobs").json())
        response = client.post(
            "/api/workflows/plans/" + exploration["plan_id"] + "/runs",
            json={"plan_sha256": exploration["plan_sha256"]},
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 201, response.text
        run_id = response.json()["id"]
        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            run = client.get("/api/workflows/runs/" + run_id).json()
            if run["state"] in {"succeeded", "failed", "blocked", "cancelled"}:
                break
            time.sleep(0.15)
        assert run["state"] == "succeeded", run
        assert len(run["attempts"]) == 8 and len(client.get("/api/jobs").json()) == before + 8
        for attempt in run["attempts"]:
            directory = state / "jobs" / attempt["job_id"]
            assert json.loads((directory / "native-exit.json").read_text())["ExitCode"] == 0
        endpoint = (
            "/api/research/pose-explorations/" + exploration["id"] + "/runs/" + run_id + "/capture"
        )
        report = state / "jobs" / run["attempts"][0]["job_id"] / "output/result.json"
        raw = report.read_bytes()
        changed = json.loads(raw)
        changed["poses"][0]["scores"][0]["value"] += 100
        report.write_text(json.dumps(changed))
        assert client.post(endpoint, json={}).status_code == 422
        report.write_bytes(raw)
        response = client.post(endpoint, json={})
        assert response.status_code == 201, response.text
        poses = response.json()
        assert poses["qualified_pose_count"] >= 8 and len(poses["outcomes"]) == 8
        assert all(o["initial_conformer_generated"] is False for o in poses["outcomes"])
        assert client.post(endpoint, json={}).json() == poses
        for outcome in poses["outcomes"]:
            c = outcome["combination"]
            assert c["receptor"] == next(
                o["protein"]
                for o in sites["observations"]
                if o["member_index"] == c["member_index"]
            )
            assert c["ligand"]["reference"] == body["ligands"][c["ligand_index"]]["reference"]
            assert c["seed"] in {2026, 2027}
            for pose in outcome["poses"]:
                if pose["reference"]:
                    version = client.get(
                        "/api/research/objects/" + pose["reference"]["version_id"]
                    ).json()
                    assert version["parent_id"] == c["ligand"]["reference"]["version_id"]
        graph = client.get("/api/research/graph?focus=pose_set:" + poses["id"]).json()
        assert any(n["kind"] == "pose_ensemble" for n in graph["nodes"])
    with TestClient(create_app(target), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/research/pose-ensembles/" + poses["id"]).json() == poses
    destination = Path("server_tests/evidence/pose-ensemble-fixture")
    destination.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(state / "jobs.sqlite3") as db:
        with sqlite3.connect(destination / "jobs.sqlite3") as backup:
            db.backup(backup)
    shutil.copytree(state / "assets", destination / "assets", dirs_exist_ok=True)
    jobs = state / "jobs"
    for output in jobs.glob("*/output"):
        shutil.copytree(
            output, destination / "jobs" / output.parent.name / "output", dirs_exist_ok=True
        )
    (destination / "acceptance.json").write_text(
        json.dumps(
            {
                "exploration_id": exploration["id"],
                "pose_set_id": poses["id"],
                "run_id": run_id,
                "site_set_id": sites["id"],
                "state_set_id": prepared["id"],
                "qualified": poses["qualified_pose_count"],
                "scope": (
                    "actual native sampling and paired provenance; "
                    "not biological affinity validation"
                ),
            }
        )
    )
