"""Actual locked RDKit/Router/Worker/API acceptance on the frozen BRD4/JQ1 case."""

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.installers import install
from opendde_workbench.examples.bundle import restore_bundle
from opendde_workbench.examples.bundle_release import SHA256
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    components = output / "components"
    components.mkdir(exist_ok=True)
    installed = install("chemistry", components, {}, str(uuid4()), print, lambda: None)
    settings = Settings(
        state_dir=output / "state",
        image_file=output / "missing-image",
        code_file=output / "missing-code",
        model_dir=output / "models",
        cache_dir=output / "cache",
        minimum_free_bytes=0,
        chemistry_image=installed["image"],
    )
    restore_bundle(args.archive, settings, SHA256)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    records = ExampleRecords(store, assets, settings)
    fixed = records.prepared("pose_exploration")
    assert fixed and len(fixed["poses"]) == 1
    poses = fixed["poses"][0]
    selections = [
        {
            "step_id": outcome["combination"]["step_id"],
            "record": next(p["evidence"]["record"] for p in outcome["poses"] if p["reference"]),
        }
        for outcome in poses["outcomes"]
        if any(p["reference"] for p in outcome["poses"])
    ]
    assert 2 <= len(selections) <= 50
    assert len({outcome["combination"]["member_index"] for outcome in poses["outcomes"]}) >= 2
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        prepared = client.post(
            "/api/research/pose-ensembles/" + poses["id"] + "/clustering-request",
            json={"name": "BRD4–JQ1 结合模式分群", "selections": selections},
        )
        assert prepared.status_code == 200, prepared.text
        task = prepared.json()
        key = str(uuid4())
        submitted = client.post("/api/jobs", json=task, headers={"Idempotency-Key": key})
        assert submitted.status_code == 201, submitted.text
        identifier = submitted.json()["id"]
        assert (
            client.post("/api/jobs", json=task, headers={"Idempotency-Key": key}).json()["id"]
            == identifier
        )
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.2)
        assert job["status"] == "succeeded", client.get("/api/jobs/" + identifier + "/logs").text
        response = client.get("/api/jobs/" + identifier + "/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert len(result["rows"]) == len(selections)
        assert sum(c["sample_count"] for c in result["clusters"]) == len(selections)
        assert result["ligand_superposition"] is False
        assert result["versions"] == {"rdkit": "2026.03.6", "numpy": "1.26.4"}
        assert all(c["representative"] in c["members"] for c in result["clusters"])
        for name, digest in result["artifacts"].items():
            data = client.get("/api/jobs/" + identifier + "/download", params={"name": name})
            assert data.status_code == 200 and hashlib.sha256(data.content).hexdigest() == digest
        indexed = client.post("/api/jobs/" + identifier + "/index-assets").json()
        assert indexed["state"] == "complete", indexed
        assert not [
            v
            for v in client.get("/api/research/objects?source_job=" + identifier).json()
            if v["kind"] in {"molecule", "structure"}
        ], "Diagnostics must not become new poses"
        graph = client.get("/api/research/graph", params={"focus": "task:" + identifier}).json()
        assert any(edge["relation"] == "pose_clustering" for edge in graph["edges"])
        assert any(edge["relation"] == "aligned_frame" for edge in graph["edges"])
        # A forged frame or selected pose never reaches execution.
        changed = json.loads(json.dumps(task))
        changed["frame"]["sha256"] = "0" * 64
        rejected = client.post("/api/jobs", json=changed, headers={"Idempotency-Key": str(uuid4())})
        assert rejected.status_code == 422, rejected.text
        # Result integrity is checked on every display, including same-size corruption.
        diagnostic = (
            settings.state_dir / "jobs" / identifier / "output" / result["rows"][0]["pose_artifact"]
        )
        original = diagnostic.read_bytes()
        try:
            diagnostic.write_bytes(b"x" + original[1:])
            assert client.get("/api/jobs/" + identifier + "/result").status_code == 422
        finally:
            diagnostic.write_bytes(original)
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
        client.post(
            "/api/deployment/config", json={"location": str(components), "automatic": False}
        )
        editor = client.post("/api/deployment/packages/ketcher/install", json={})
        assert editor.status_code == 200, editor.text
        ids = editor.json()["operations"]
        deadline = time.monotonic() + 150
        while time.monotonic() < deadline:
            rows = [
                row
                for row in client.get("/api/deployment").json()["operations"]
                if row["id"] in ids
            ]
            assert not any(row["state"] in {"failed", "cancelled", "paused"} for row in rows), rows
            if len(rows) == len(ids) and all(row["state"] == "succeeded" for row in rows):
                break
            time.sleep(0.3)
        else:
            raise TimeoutError("Native Ketcher installation did not finish")
    source = assets.path(assets.get(result["rows"][0]["reference"]["asset_id"]))
    command = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "1024m",
        "--cpus",
        "1",
        "--pids-limit",
        "64",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=64m",
        "--env",
        "PYTHONPATH=/platform",
        "--env",
        "OMP_NUM_THREADS=1",
        "--mount",
        "type=bind,source="
        + str(Path("src/opendde_workbench/chemistry").resolve())
        + ",target=/platform,readonly",
        "--mount",
        "type=bind,source="
        + str(Path("server_tests/cluster_native_benchmark.py").resolve())
        + ",target=/benchmark.py,readonly",
        "--mount",
        "type=bind,source=" + str(source) + ",target=/pose.sdf,readonly",
        "--mount",
        "type=bind,source=" + str(output) + ",target=/evidence",
        "--entrypoint",
        "python",
        installed["image"],
        "-B",
        "/benchmark.py",
        "/pose.sdf",
        "/evidence/native-benchmark.json",
    ]
    subprocess.run(command, check=True, timeout=120)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
        assert records.prepared("pose_exploration")["poses"][0] == poses
    receipt = {
        "job_id": identifier,
        "pose_set_id": poses["id"],
        "exploration_id": poses["exploration_id"],
        "input_pose_count": len(selections),
        "cluster_count": len(result["clusters"]),
        "chemistry_image": installed["image"],
        "immutable_references": True,
        "api_idempotency": True,
        "restart_preserved": True,
        "tampered_diagnostic_rejected": True,
        "forged_frame_rejected": True,
        "diagnostics_not_promoted": True,
        "scientific_scope": "pose_geometry_and_geometric_contacts_not_binding_validation",
    }
    (output / "acceptance.json").write_text(json.dumps(receipt, indent=2))
    (output / "result.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
