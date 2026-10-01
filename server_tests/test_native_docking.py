"""Actual pinned GNINA binary, isolated runtime, API/Worker and SQLite; remote CPU only."""

import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_DOCKING") != "1",
    reason="Native docking runs on the remote CI runner only.",
)

FIXTURES = {
    "184l_lig.sdf": ("71c1e23e3da8d76b06e363a4a90d9afcd04f9239", 1797),
    "184l_rec.pdb": ("52c7ca48c03613fce2c67203a8363a30c87dcf77", 206499),
}


def upstream_fixture(name):
    from opendde_workbench.docking.manifest import SOURCE_COMMIT

    url = (
        "https://raw.githubusercontent.com/gnina/gnina/"
        + SOURCE_COMMIT
        + "/test/gnina/data/"
        + name
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        content = response.read(1024**2)
    oid, size = FIXTURES[name]
    assert len(content) == size
    assert hashlib.sha1(b"blob " + str(size).encode() + b"\0" + content).hexdigest() == oid
    return content


def test_real_gnina_three_modes_and_exact_pose_assets(tmp_path, monkeypatch):
    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.docking_install import install_docking
    from opendde_workbench.settings import Settings

    # Native environment isolation must not change where the already installed browser lives.
    browser_cache = os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or str(
        Path.home() / ".cache/ms-playwright"
    )
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", browser_cache)
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    root = tmp_path / "components"
    root.mkdir()
    work = tmp_path / "install"
    work.mkdir()

    def execute(args, timeout=3600):
        result = subprocess.run(
            [str(a) for a in args], capture_output=True, text=True, timeout=timeout
        )
        if result.returncode:
            raise RuntimeError(
                "Native installation failed: " + result.stdout[-3000:] + result.stderr[-3000:]
            )
        return result.stdout

    installed = install_docking(root, work, execute, print, lambda: None)
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "missing-opendde-image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        gnina_image=installed["image"],
    )
    evidence = Path("server_tests/evidence")
    evidence.mkdir(exist_ok=True)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        refs = {}
        for role, name, kind in [
            ("receptor", "184l_rec.pdb", "structure"),
            ("ligand", "184l_lig.sdf", "ligand"),
        ]:
            uploaded = client.post(
                "/api/assets?kind=" + kind + "&name=" + name,
                content=upstream_fixture(name),
                headers={"Content-Type": "application/octet-stream"},
            )
            assert uploaded.status_code == 201, uploaded.text
            asset = uploaded.json()
            registered = client.post(
                "/api/research/objects",
                json={
                    "asset_id": asset["id"],
                    "kind": "structure" if role == "receptor" else "molecule",
                    "label": name,
                },
                headers={"Idempotency-Key": str(uuid4())},
            )
            assert registered.status_code == 201, registered.text
            refs[role] = registered.json()["reference"]
        raw_runtime = execute(["docker", "info", "--format", "{{json .Runtimes}}"])
        labels = execute(
            [
                "docker",
                "image",
                "inspect",
                "--format",
                "{{json .Config.Labels}}",
                installed["image"],
            ]
        )
        (evidence / "docker-metadata.json").write_text(
            json.dumps(
                {
                    "runtimes_bytes": len(raw_runtime.encode()),
                    "runtime_names": list(json.loads(raw_runtime)),
                    "image_labels": json.loads(labels),
                },
                indent=2,
            )
        )
        health = client.get("/api/health").json()
        (evidence / "runtime-health.json").write_text(json.dumps(health, indent=2))
        assert health["environments"]["gnina"]["ready"], health["environments"]["gnina"]
        assert not health["environments"]["opendde"]["ready"]
        # Real chemical parser supplies the explicit receptor-frame center in remote CI.
        parsed = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-i",
                "--network",
                "none",
                "--entrypoint",
                "python",
                installed["image"],
                "-c",
                "import sys,json; from rdkit import Chem; "
                "m=Chem.MolFromMolBlock(sys.stdin.read(),removeHs=True); "
                "p=m.GetConformer().GetPositions(); print(json.dumps(p.mean(axis=0).tolist()))",
            ],
            input=upstream_fixture("184l_lig.sdf").decode(),
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        explicit_box = {
            "center": json.loads(parsed.stdout),
            "size": [30, 30, 30],
            "unit": "angstrom",
        }
        pose = refs["ligand"]
        for mode in ("dock", "score", "minimize"):
            request = {
                "operation": "docking",
                "name": "remote native " + mode,
                "mode": mode,
                "receptor": refs["receptor"],
                "ligand": pose,
                "options": {
                    "cnn_scoring": "none",
                    "cpu": 2,
                    "exhaustiveness": 1,
                    "num_modes": 2,
                    "time_limit_seconds": 180,
                },
            }
            if mode == "dock":
                request["search"] = {"kind": "box", "frame": refs["receptor"], "box": explicit_box}
                constraint = client.post(
                    "/api/research/constraints",
                    json={
                        "name": "Native receptor search",
                        "subject": pose,
                        "frame": {"reference": refs["receptor"], "basis": "reference_coordinates"},
                        "conditions": [
                            {
                                "id": str(uuid4()),
                                "label": "Search bounds",
                                "kind": "search_box",
                                "box": explicit_box,
                            },
                            {
                                "id": str(uuid4()),
                                "label": "Output centroid",
                                "kind": "spatial_bounds",
                                "phase": "result",
                                "selection": "heavy_atom_centroid",
                                "validator": "rdkit_receptor_bounds_v1",
                                "box": explicit_box,
                            },
                        ],
                    },
                    headers={"Idempotency-Key": str(uuid4())},
                )
                assert constraint.status_code == 201, constraint.text
                request["constraints"] = {k: constraint.json()[k] for k in ("id", "sha256")}
            else:
                request.update(pose_frame=refs["receptor"], pose_coordinate_basis="user_confirmed")
            response = client.post(
                "/api/jobs", json=request, headers={"Idempotency-Key": str(uuid4())}
            )
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            deadline = time.monotonic() + 240
            while time.monotonic() < deadline:
                job = client.get("/api/jobs/" + identifier).json()
                if job["status"] not in {"queued", "running", "cancelling"}:
                    break
                time.sleep(0.1)
            output = settings.state_dir / "jobs" / identifier / "output"
            for file in output.glob("*"):
                if file.is_file() and file.stat().st_size < 4 * 1024**2:
                    shutil.copyfile(file, evidence / (mode + "-" + file.name))
            retained_log = client.get("/api/jobs/" + identifier + "/logs").json()["text"]
            (evidence / (mode + "-worker.log")).write_text(retained_log)
            if job["status"] != "succeeded":
                print(retained_log)
            assert job["status"] == "succeeded", client.get(
                "/api/jobs/" + identifier + "/logs"
            ).json()
            result = client.get("/api/jobs/" + identifier + "/result").json()
            assert result["mode"] == mode and result["complete"]
            if mode == "dock":
                receipt = client.get("/api/jobs/" + identifier + "/constraints")
                assert receipt.status_code == 200, receipt.text
                assert receipt.json()["conditions"][0]["value"] == explicit_box
                assert result["search"]["box"] == explicit_box
                assert (
                    receipt.json()["conditions"][0]["independent_result_check"] == "not_implemented"
                )
                (evidence / "dock-constraint-receipt.json").write_text(
                    json.dumps(receipt.json(), indent=2)
                )
            assert result["frame"] == refs["receptor"]
            assert result["scientific_acceptance"] == "pending_server_validation"
            valid = [p for p in result["poses"] if p["valid"]]
            assert valid, result
            if mode == "dock":
                assert all(p["constraint_checks"][0]["passed"] for p in valid)
                assert result["pose_artifact"] == "qualified-poses.sdf"
                assert result["raw_pose_artifact"] == "poses.sdf"
            assert all(s["name"] == "minimizedAffinity" for p in valid for s in p["scores"])
            selected = valid[0]
            assert selected["artifact"] == f"pose-{selected['record'] + 1:03d}.sdf"
            environment = client.get("/api/jobs/" + identifier + "/environment").json()
            assert environment["specification"]["scientific_software"] == "gnina"
            assert environment["specification"]["runtime"]["image"] == installed["image"]
            indexed = client.post("/api/jobs/" + identifier + "/index-assets", json={})
            assert indexed.status_code == 200, indexed.text
            assert indexed.json()["state"] == "complete", indexed.text
            versions = client.get(
                "/api/research/objects", params={"source_job": identifier, "limit": 200}
            ).json()
            selected_version = next(v for v in versions if v["label"] == selected["artifact"])
            assert selected_version["parent_id"] == pose["version_id"]
            assert selected_version["reference"]["record"] == 0
            pose = selected_version["reference"]
            assert all(v["source_job"] == identifier for v in versions)
            (evidence / (mode + "-acceptance.json")).write_text(
                json.dumps({"job": job, "result": result, "environment": environment}, indent=2)
            )
        # Real native scoring completes, but a distant hard output condition rejects its pose.
        negative_condition = client.post(
            "/api/research/constraints",
            json={
                "name": "Reject far output bounds",
                "subject": pose,
                "frame": {"reference": refs["receptor"], "basis": "reference_coordinates"},
                "conditions": [
                    {
                        "id": str(uuid4()),
                        "label": "All heavy atoms",
                        "kind": "spatial_bounds",
                        "phase": "result",
                        "selection": "all_heavy_atoms",
                        "box": {"center": [10000, 10000, 10000], "size": [4, 4, 4]},
                    }
                ],
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert negative_condition.status_code == 201, negative_condition.text
        negative_request = {
            "operation": "docking",
            "name": "Native output rejection",
            "mode": "score",
            "receptor": refs["receptor"],
            "ligand": pose,
            "pose_frame": refs["receptor"],
            "pose_coordinate_basis": "user_confirmed",
            "constraints": {k: negative_condition.json()[k] for k in ("id", "sha256")},
            "options": {"cpu": 2, "cnn_scoring": "none", "time_limit_seconds": 180},
        }
        rejected = client.post(
            "/api/jobs", json=negative_request, headers={"Idempotency-Key": str(uuid4())}
        )
        assert rejected.status_code == 201, rejected.text
        rejected_id = rejected.json()["id"]
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            rejected_job = client.get("/api/jobs/" + rejected_id).json()
            if rejected_job["status"] not in {"queued", "running", "cancelling"}:
                break
            time.sleep(0.1)
        assert rejected_job["status"] == "succeeded", client.get(
            "/api/jobs/" + rejected_id + "/logs"
        ).json()
        rejected_result = client.get("/api/jobs/" + rejected_id + "/result").json()
        assert rejected_result["scientific_outcome"] == "no_valid_pose"
        rejected_pose = rejected_result["poses"][0]
        assert not rejected_pose["valid"] and rejected_pose["constraint_checks"][0]["violations"]
        assert rejected_pose["diagnostic_artifact"] == "diagnostic-pose-001.sdf"
        assert (
            client.post("/api/jobs/" + rejected_id + "/index-assets", json={}).json()["state"]
            == "complete"
        )
        for name in ("poses.sdf", "qualified-poses.sdf", "diagnostic-pose-001.sdf"):
            denied = client.post(
                "/api/jobs/" + rejected_id + "/assets", params={"kind": "ligand", "name": name}
            )
            assert denied.status_code == 422, denied.text
        rejected_versions = client.get(
            "/api/research/objects", params={"source_job": rejected_id, "limit": 200}
        ).json()
        assert all(
            v["label"] not in {"poses.sdf", "qualified-poses.sdf", "diagnostic-pose-001.sdf"}
            for v in rejected_versions
        )
        (evidence / "output-constraint-rejection.json").write_text(
            json.dumps(
                {"job": rejected_job, "result": rejected_result, "versions": rejected_versions},
                indent=2,
            )
        )
        completed_job_id = identifier
        completed_pose = selected
        completed_reference = pose
        # Actual long-search container is cancelled through the sole Worker/BackendRouter.
        request = {
            "operation": "docking",
            "name": "native cancellation",
            "mode": "dock",
            "receptor": refs["receptor"],
            "ligand": refs["ligand"],
            "search": {
                "kind": "reference_ligand",
                "frame": refs["receptor"],
                "reference": refs["ligand"],
                "coordinate_basis": "user_confirmed",
            },
            "options": {
                "cnn_scoring": "none",
                "cpu": 2,
                "exhaustiveness": 128,
                "num_modes": 10,
                "time_limit_seconds": 180,
            },
        }
        submitted = client.post(
            "/api/jobs", json=request, headers={"Idempotency-Key": str(uuid4())}
        )
        assert submitted.status_code == 201, submitted.text
        cancelled_id = submitted.json()["id"]
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            probe = subprocess.run(
                [
                    "docker",
                    "inspect",
                    "--format",
                    "{{.State.Running}}",
                    "xdde-gnina-" + cancelled_id,
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if (
                probe.returncode == 0
                and probe.stdout.strip() == "true"
                and (settings.state_dir / "jobs" / cancelled_id / "output/native.log").is_file()
            ):
                break
            time.sleep(0.1)
        else:
            raise AssertionError(
                "Native cancellation fixture never reached the scientific execution boundary."
            )
        response = client.post("/api/jobs/" + cancelled_id + "/cancel", json={})
        assert response.status_code == 200, response.text
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            cancelled = client.get("/api/jobs/" + cancelled_id).json()
            if cancelled["status"] == "cancelled":
                break
            time.sleep(0.1)
        assert cancelled["status"] == "cancelled", cancelled
        assert (
            subprocess.run(
                ["docker", "inspect", "xdde-gnina-" + cancelled_id], capture_output=True
            ).returncode
            != 0
        )
        assert not (settings.state_dir / "jobs" / cancelled_id / "process.json").exists()
        (evidence / "native-cancellation.json").write_text(json.dumps(cancelled, indent=2))
    # New server lifespan uses persisted jobs, versions and environment snapshots.
    with TestClient(create_app(replace(settings)), base_url="http://127.0.0.1:4320") as client:
        persisted_jobs = client.get("/api/jobs").json()
        assert len(persisted_jobs) == 5
        assert {j["request"]["name"] for j in persisted_jobs} == {
            "remote native dock",
            "remote native score",
            "remote native minimize",
            "Native output rejection",
            "native cancellation",
        }
        persisted_rejection = next(j for j in persisted_jobs if j["id"] == rejected_id)
        assert persisted_rejection["status"] == "succeeded"
        assert (
            client.get("/api/jobs/" + rejected_id + "/result").json()["scientific_outcome"]
            == "no_valid_pose"
        )
        assert client.get("/api/research/objects/" + pose["version_id"]).status_code == 200

    from docking_browser import inspect_results

    inspect_results(
        settings,
        installed["image"],
        completed_job_id,
        completed_pose,
        completed_reference,
        evidence,
        rejected_id,
    )

    from pose_native_acceptance import inspect_pose_campaign

    inspect_pose_campaign(settings, installed["image"])
