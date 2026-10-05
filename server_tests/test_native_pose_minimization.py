"""Real remote CPU force fields/GNINA, existing queue, autosave and clinical research inputs."""

import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pose_minimization_fixture import public_material, receptor_chain_a

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_MINIMIZATION") != "1",
    reason="isolated remote scientific acceptance only",
)


def wait_job(client, identifier):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{identifier}").json()
        if job["status"] in {"succeeded", "failed", "cancelled", "interrupted"}:
            break
        time.sleep(0.1)
    assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
    return job


def test_native_free_and_bound_jq1_poses_autosave_without_overwriting_sources(tmp_path):
    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.settings import Settings

    evidence = Path("server_tests/evidence/pose-minimization")
    evidence.mkdir(parents=True, exist_ok=True)
    root = tmp_path / "components"
    root.mkdir()
    chemistry = install(
        "chemistry", root, {}, str(uuid4()), lambda msg: print(msg, flush=True), lambda: None
    )
    gnina = install(
        "gnina", root, {}, str(uuid4()), lambda msg: print(msg, flush=True), lambda: None
    )
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        chemistry_image=chemistry["image"],
        gnina_image=gnina["image"],
    )
    original, source = public_material("jq1")
    protein, protein_source = public_material("brd4")
    ligand = (
        original.rstrip() + b"\n$$$$\n" if not original.rstrip().endswith(b"$$$$") else original
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        asset = client.post(
            "/api/assets?kind=ligand&name=3MXF-JQ1-pose.sdf",
            content=ligand + ligand,
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        selected = {"kind": "asset", "asset_id": asset["id"], "record": 1}
        ids = []
        reports = []
        for method in ("MMFF94s", "UFF"):
            body = {"source": selected, "method": method}
            key = str(uuid4())
            response = client.post(
                "/api/research/poses/minimize", json=body, headers={"Idempotency-Key": key}
            )
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            assert (
                client.post(
                    "/api/research/poses/minimize", json=body, headers={"Idempotency-Key": key}
                ).json()["id"]
                == identifier
            )
            job = wait_job(client, identifier)
            result = client.get(f"/api/jobs/{identifier}/result").json()
            assert result["source"]["record"] == 1
            assert result["identity_preserved"] and result["coordinate_stereo_preserved"]
            assert result["method"] == method and result["energy_after"] < result["energy_before"]
            assert result["converged"], result
            objects = client.get(f"/api/research/objects?source_job={identifier}").json()
            poses = [v for v in objects if v["kind"] == "molecule"]
            assert len(poses) == 1 and poses[0]["relation"] == "edited_from"
            saved = client.post(f"/api/research/poses/{identifier}/save", json={}).json()
            assert saved["pose"] == poses[0]
            assert saved == client.post(f"/api/research/poses/{identifier}/save", json={}).json()
            downloaded = client.get(f"/api/assets/{saved['pose']['reference']['asset_id']}").content
            assert hashlib.sha256(downloaded).hexdigest() == result["artifact_sha256"]
            assert client.get(f"/api/assets/{asset['id']}").content == ligand + ligand
            reports.append({"job": job, "result": result, "saved": saved})
            ids.append(identifier)
        receptor = client.post(
            "/api/assets?kind=structure&name=3MXF-receptor-A.pdb",
            content=receptor_chain_a(protein),
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        body = {
            "source": selected,
            "method": "receptor",
            "max_iterations": 300,
            "receptor": {"kind": "asset", "asset_id": receptor["id"]},
            "coordinate_basis": "user_confirmed",
        }
        response = client.post(
            "/api/research/poses/minimize", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        job = wait_job(client, identifier)
        saved_response = client.post(f"/api/research/poses/{identifier}/save", json={})
        assert saved_response.status_code == 200, saved_response.text
        saved = saved_response.json()
        assert saved["native_score"]["method"] == "GNINA" and saved["energy"] is None
        assert saved["receptor"] == job["request"]["receptor"]
        assert saved["pose"]["parent_id"] == job["request"]["ligand"]["version_id"]
        assert client.get(f"/api/assets/{receptor['id']}").content == receptor_chain_a(protein)
        reports.append({"job": job, "saved": saved})
        (evidence / "native-acceptance.json").write_text(
            json.dumps({"sources": [source, protein_source], "cases": reports}, indent=2)
        )
    # The real browser continues these same completed native tasks, with the same Docker images.
    shutil.copytree(settings.state_dir, evidence / "state", dirs_exist_ok=True)
    (evidence / "browser-config.json").write_text(
        json.dumps(
            {
                "chemistry_image": chemistry["image"],
                "gnina_image": gnina["image"],
                "free_job": ids[0],
                "bound_job": identifier,
            }
        )
    )
