"""Real SQLite/API/process protocols for research orchestration; no scientific inference."""

import time
from uuid import uuid4

import pytest
from conftest import ProcessEngine
from pydantic import ValidationError

from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.store import Store
from opendde_workbench.workflows.contracts import PlanInput
from opendde_workbench.workflows.storage import WorkflowRecords


def task(name="step"):
    return {"operation": "properties", "name": name, "smiles": ["CCO"]}


def plan():
    return {
        "name": "series",
        "steps": [
            {"id": "first", "request": task("first")},
            {"id": "second", "request": task("second"), "depends_on": ["first"]},
        ],
        "budget": {"max_jobs": 2, "wall_seconds": 60},
    }


def save(client, value=None, key=None):
    return client.post(
        "/api/workflows/plans",
        json=value or plan(),
        headers={"Idempotency-Key": key or str(uuid4())},
    )


def wait_run(client, id, states, timeout=12):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        run = client.get("/api/workflows/runs/" + id).json()
        if run["state"] in states:
            return run
        time.sleep(0.04)
    raise AssertionError(run)


def test_plan_graph_budget_and_output_slots_are_validated():
    for edit in [
        lambda v: v["steps"][0].update(depends_on=["second"]),
        lambda v: v["steps"][1].update(id="first"),
        lambda v: v["budget"].update(max_jobs=1),
        lambda v: v["steps"][1].update(
            bindings=[
                {"from_step": "first", "target": "protein", "kind": "ligand", "artifact": "x.pdb"}
            ]
        ),
        lambda v: v["steps"][1].update(
            bindings=[
                {
                    "from_step": "first",
                    "target": "property_input",
                    "kind": "ligand",
                    "artifact": "x.sdf",
                    "result_field": "molecule_artifact",
                }
            ]
        ),
    ]:
        value = plan()
        edit(value)
        with pytest.raises(ValidationError):
            PlanInput.model_validate(value)


def test_immutable_plan_digest_idempotency_restart_and_csrf(client_factory):
    key = str(uuid4())
    with client_factory() as client:
        original = save(client, key=key).json()
        assert save(client, key=key).json() == original
        changed = plan()
        changed["name"] = "other"
        assert save(client, changed, key).status_code == 409
        assert (
            client.post(
                "/api/workflows/plans",
                json=plan(),
                headers={"Idempotency-Key": str(uuid4()), "X-Workbench-CSRF": "bad"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/workflows/plans/" + original["id"] + "/runs",
                json={"plan_sha256": "a" * 64},
                headers={"Idempotency-Key": str(uuid4())},
            ).status_code
            == 409
        )
        assert client.get("/api/workflows/schema").status_code == 200
        assert client.get("/api/jobs").json() == []
    with client_factory() as client:
        assert client.get("/api/workflows/plans/" + original["id"]).json() == original
        assert client.get("/api/workflows/plans/" + str(uuid4())).status_code == 404


def test_native_steps_reuse_one_queue_and_persist_dependencies(client_factory):
    script = (
        "from pathlib import Path; import json; "
        "Path('output/result.json').write_text(json.dumps("
        "{'operation':'properties','complete':True,'molecules':[]}))"
    )
    with client_factory(ProcessEngine(script)) as client:
        saved = save(client).json()
        key = str(uuid4())
        endpoint = "/api/workflows/plans/" + saved["id"] + "/runs"
        response = client.post(
            endpoint, json={"plan_sha256": saved["sha256"]}, headers={"Idempotency-Key": key}
        )
        assert response.status_code == 201
        run = wait_run(client, response.json()["id"], {"succeeded"})
        assert len(run["attempts"]) == 2
        assert {a["status"] for a in run["attempts"]} == {"succeeded"}
        assert (
            client.post(
                endpoint, json={"plan_sha256": saved["sha256"]}, headers={"Idempotency-Key": key}
            ).json()["id"]
            == run["id"]
        )
        assert len(client.get("/api/jobs").json()) == 2
        graph = client.get("/api/research/graph").json()
        assert {
            "source": "plan:" + saved["id"],
            "target": "run:" + run["id"],
            "relation": "executed_as",
        } in graph["edges"]
    with client_factory() as client:
        assert client.get("/api/workflows/runs/" + run["id"]).json() == run


def test_output_binding_uses_real_artifact_and_new_version(client_factory):
    script = (
        "from pathlib import Path; import json; "
        "Path('output/library.sdf').write_text('one\n$$$$\ntwo\n$$$$\n'); "
        "Path('output/result.json').write_text(json.dumps("
        "{'operation':'properties','complete':True,"
        "'molecule_artifact':'library.sdf','molecules':[]}))"
    )
    value = plan()
    value["steps"][1]["bindings"] = [
        {
            "from_step": "first",
            "target": "property_input",
            "kind": "ligand",
            "result_field": "molecule_artifact",
            "record": 1,
        }
    ]
    with client_factory(ProcessEngine(script)) as client:
        saved = save(client, value).json()
        response = client.post(
            "/api/workflows/plans/" + saved["id"] + "/runs",
            json={"plan_sha256": saved["sha256"]},
            headers={"Idempotency-Key": str(uuid4())},
        )
        run = wait_run(client, response.json()["id"], {"succeeded", "blocked"})
        assert run["state"] == "succeeded", run
        second = client.get("/api/jobs/" + run["attempts"][1]["job_id"]).json()
        ref = second["request"]["scientific_inputs"][0]
        assert ref["record"] == 1 and ref["version_id"]
        assert second["request"]["smiles"] == []
        assert second["request"]["ligand_files"] == [ref["asset_id"]]


def test_pause_resume_block_and_cancel_have_explicit_lifecycle(client_factory):
    with client_factory(ProcessEngine(ready=False)) as client:
        saved = save(client).json()
        run = client.post(
            "/api/workflows/plans/" + saved["id"] + "/runs",
            json={"plan_sha256": saved["sha256"]},
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        blocked = wait_run(client, run["id"], {"blocked"})
        assert blocked["reason"] and not blocked["attempts"]
        root = "/api/workflows/runs/" + run["id"]
        assert client.post(root + "/pause").json()["state"] == "paused"
        assert client.post(root + "/resume").status_code == 200
        wait_run(client, run["id"], {"blocked"})
        assert client.post(root + "/cancel").status_code == 200
        wait_run(client, run["id"], {"cancelled"})
        assert client.post(root + "/resume").status_code == 409


def test_retry_bounds_and_backoff_do_not_resubmit_without_limit(client_factory):
    value = plan()
    value["steps"] = value["steps"][:1]
    value["steps"][0].update(retries=1, retry_backoff_seconds=1)
    with client_factory(ProcessEngine("raise SystemExit(2)")) as client:
        saved = save(client, value).json()
        run = client.post(
            "/api/workflows/plans/" + saved["id"] + "/runs",
            json={"plan_sha256": saved["sha256"]},
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        failed = wait_run(client, run["id"], {"failed"})
        assert len(failed["attempts"]) == 2
        first = client.get("/api/jobs/" + failed["attempts"][0]["job_id"]).json()
        second = client.get("/api/jobs/" + failed["attempts"][1]["job_id"]).json()
        from datetime import datetime

        assert (
            datetime.fromisoformat(second["created_at"])
            - datetime.fromisoformat(first["finished_at"])
        ).total_seconds() >= 1
        assert second["parent_id"] == first["id"]


def test_attempt_job_link_is_atomic_and_restart_does_not_create_another_job(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    records = WorkflowRecords(store)
    saved = records.save_plan(PlanInput.model_validate(plan()), uuid4())
    run = records.start(saved["id"], saved["sha256"], uuid4())
    job = records.enqueue(run["id"], "first", TASK_ADAPTER.validate_python(task()), 20, 100)
    reopened = WorkflowRecords(Store(store.path))
    assert reopened.run(run["id"])["attempts"][0]["job_id"] == job.id
    assert len(store.list_jobs()) == 1
    assert reopened.change(run["id"], "paused")["state"] == "paused"
    assert (
        reopened.enqueue(run["id"], "second", TASK_ADAPTER.validate_python(task()), 20, 100) is None
    )


def test_wall_budget_cancels_an_active_real_process_without_waiting_for_its_completion(
    client_factory,
):
    value = plan()
    value["steps"] = value["steps"][:1]
    value["budget"]["wall_seconds"] = 1
    with client_factory(ProcessEngine("import time; time.sleep(30)")) as client:
        saved = save(client, value).json()
        run = client.post(
            "/api/workflows/plans/" + saved["id"] + "/runs",
            json={"plan_sha256": saved["sha256"]},
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        result = wait_run(client, run["id"], {"cancelled"}, timeout=8)
        assert len(result["attempts"]) == 1
        assert result["attempts"][0]["status"] == "cancelled"


def test_saved_workflow_protects_an_uploaded_input_from_deletion(client_factory):
    with client_factory() as client:
        asset = client.post(
            "/api/assets?kind=ligand&name=input.sdf",
            content=b"one\n$$$$\n",
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        value = plan()
        value["steps"] = value["steps"][:1]
        value["steps"][0]["request"] = {
            "operation": "properties",
            "name": "retained",
            "ligand_files": [asset["id"]],
        }
        assert save(client, value).status_code == 201
        assert client.delete("/api/assets/" + asset["id"]).status_code == 409
