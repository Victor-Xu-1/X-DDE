"""Prepare two genuine indexed preview poses before read-only layout inspection."""

import hashlib
import json
import os
import subprocess
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.installers import install
from opendde_workbench.research.initial_pose import InitialPosePreparation
from opendde_workbench.research.pose_contract import InitialPoseInput
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store

INDEX_JOB = "4efbb800-3273-4668-a35a-7725a9dfdcd2"
REPORT_SHA256 = "d87e130ee8876fec32bfaaac6da4f8558cc6565bbac48271637373b868053472"
MEMBERS = (
    (
        "cmp-12b1867ef7579dad15b9c4ec8b340aa6daeb428648e5a4d2f89e8ab2998bf10b",
        "CHEMBL126384",
        "a0de3544e953ed815f680ee5de592ff78ad15a4351dc0d9c92d7cb12cc16037d",
    ),
    (
        "cmp-9fc0370ca51206ed71683766d5340dca5aed558a6b3c92d7984fb10abb2d0568",
        "CHEMBL126623",
        "fff73b2abbff6f6b9edff6b354b9c4894127a49005806ff801a754053fa4491a",
    ),
)
OPTIONS = {
    "force_field": "MMFF94s",
    "initialize_3d": True,
    "seed": 2026,
    "max_iterations": 1000,
    "cpu": 1,
    "memory_mib": 2048,
    "time_limit_seconds": 120,
}


def response_json(response):
    assert response.status_code == 200, response.text
    return response.json()


def job_states(store):
    with store.connect() as db:
        return {row["id"]: row["status"] for row in db.execute("SELECT id,status FROM jobs")}


def wait_completed(client, identifier):
    # The native request has its own 120s execution limit; allow 30s queue/cleanup overhead.
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        job = response_json(client.get(f"/api/jobs/{identifier}"))
        if job["status"] in {"succeeded", "failed", "cancelled", "interrupted"}:
            assert job["status"] == "succeeded", job
            return job
        time.sleep(0.2)
    client.post(f"/api/jobs/{identifier}/cancel", json={})
    raise AssertionError(f"Indexed preview preparation exceeded its bounded wait: {identifier}")


def prepare_member(client, store, assets, settings, evidence, member):
    identifier, label, digest = member
    detail = response_json(
        client.get(f"/api/datasets/{INDEX_JOB}/members/detail", params={"member_id": identifier})
    )
    assert (detail["id"], detail["label"], detail["sha256"]) == member
    assert detail["report_sha256"] == REPORT_SHA256
    original = client.get(detail["url"])
    assert original.status_code == 200
    assert hashlib.sha256(original.content).hexdigest() == digest
    saved_source = response_json(
        client.post(
            f"/api/datasets/{INDEX_JOB}/members/preserve",
            json={"member_id": identifier, "report_sha256": REPORT_SHA256},
        )
    )
    assert saved_source["source_job"] == INDEX_JOB
    assert saved_source["reference"]["sha256"] == digest
    assert saved_source["reference"]["record"] == 0
    body = {"source": {"kind": "version", "version_id": saved_source["id"]}}
    # Validate exact resource/source authority before the API may enqueue any work.
    task, pose = InitialPosePreparation(store, assets, settings).resolve(
        InitialPoseInput.model_validate(body)
    )
    assert pose is None and task.operation == "molecule_minimize"
    assert task.options.model_dump() == OPTIONS
    assert task.molecule.model_dump(mode="json") == saved_source["reference"]
    started = time.monotonic()
    reply = response_json(
        client.post(
            "/api/research/poses/initial", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
    )
    assert reply["state"] == "task"
    job = wait_completed(client, reply["job"]["id"])
    report = response_json(client.get(f"/api/jobs/{job['id']}/result"))
    assert report["source"] == saved_source["reference"]
    assert report["options"] == OPTIONS and report["method"] == "MMFF94s"
    assert report["initialization"] == "ETKDGv3" and report["initialization_seed"] == 2026
    assert (
        report["converged"]
        and report["identity_preserved"]
        and report["coordinate_stereo_preserved"]
    ), report
    child = response_json(client.post(f"/api/research/poses/{job['id']}/save", json={}))
    reference = child["pose"]["reference"]
    assert child["pose"]["source_job"] == job["id"]
    assert child["pose"]["relation"] == "edited_from"
    computed = client.get(f"/api/assets/{reference['asset_id']}")
    assert computed.status_code == 200
    assert (
        hashlib.sha256(computed.content).hexdigest()
        == reference["sha256"]
        == report["artifact_sha256"]
    )
    assert b"3D" in computed.content.splitlines()[1]
    assert client.get(detail["url"]).content == original.content
    qualified = response_json(
        client.post(
            "/api/research/poses/initial",
            json={"source": {"kind": "version", "version_id": child["pose"]["id"]}},
            headers={"Idempotency-Key": str(uuid4())},
        )
    )
    assert qualified["state"] == "ready" and qualified["pose"] == child["pose"]
    again = response_json(
        client.post(
            "/api/research/poses/initial", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
    )
    assert again["state"] == "task" and again["job"]["id"] == job["id"]
    (evidence / f"indexed-preview-{label}-original.mol").write_bytes(original.content)
    (evidence / f"indexed-preview-{label}-computed.sdf").write_bytes(computed.content)
    return {
        "member": detail,
        "source": saved_source,
        "job": job,
        "report": report,
        "saved": child,
        "preparation_seconds": time.monotonic() - started,
        "original_unchanged": True,
        "reopen_reuses_job": True,
    }


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true", "Automatic isolated CI only"
    assert os.environ.get("WB_LAYOUT_WIDTH") == "1440" and os.environ.get("WB_LAYOUT_SHARD") == "0"
    runner = Path(os.environ["RUNNER_TEMP"]).resolve()
    settings = Settings.from_env()
    assert settings.state_dir.resolve().is_relative_to(runner)
    assert settings.chemistry_image is None, "Do not enable scientific execution during inspection"
    store = Store(settings.state_dir / "jobs.sqlite3")
    before = job_states(store)
    assert before and set(before.values()) == {"succeeded"}
    evidence = Path("server_tests/evidence/task-layout")
    evidence.mkdir(parents=True, exist_ok=True)
    proof = {"members": MEMBERS, "per_task_bounds": OPTIONS, "maximum_tasks": 2, "cases": []}
    root = runner / "indexed-preview-chemistry"
    root.mkdir(exist_ok=True)
    started = time.monotonic()
    try:
        runtime = install("chemistry", root, {}, str(uuid4()), print, lambda: None)
        size = subprocess.check_output(
            ["docker", "image", "inspect", "--format", "{{.Size}}", runtime["image"]],
            text=True,
            timeout=30,
        )
        proof["installation"] = {
            **runtime,
            "seconds": time.monotonic() - started,
            "image_bytes": int(size),
        }
        # This image is intentionally NOT exported to GITHUB_ENV or deployment state.
        # The later browser may reuse completed tasks, but cannot run an extra molecule.
        native_settings = replace(settings, chemistry_image=runtime["image"])
        assets = AssetStore(store, settings.state_dir / "assets")
        with TestClient(
            create_app(native_settings), base_url=os.environ["WB_BROWSER_URL"]
        ) as client:
            client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
            rows = response_json(
                client.get(f"/api/datasets/{INDEX_JOB}/members", params={"limit": 2})
            )["rows"]
            assert [(row["id"], row["display_name"]) for row in rows] == [m[:2] for m in MEMBERS]
            for member in MEMBERS:
                proof["active_member"] = member[0]
                proof["cases"].append(
                    prepare_member(client, store, assets, native_settings, evidence, member)
                )
        after = job_states(store)
        ids = {case["job"]["id"] for case in proof["cases"]}
        assert len(ids) == 2 and set(after) - set(before) == ids
        assert {identifier: after[identifier] for identifier in before} == before
        assert all(after[identifier] == "succeeded" for identifier in ids)
        proof["new_completed_jobs"] = sorted(ids)
        proof["browser_compute_disabled"] = True
    except Exception as error:
        proof["error"] = str(error)
        raise
    finally:
        if "installation" not in proof:
            proof["installation"] = {"seconds": time.monotonic() - started, "completed": False}
        proof["total_seconds"] = time.monotonic() - started
        (evidence / "indexed-preview-prerequisites.json").write_text(json.dumps(proof, indent=2))


if __name__ == "__main__":
    main()
