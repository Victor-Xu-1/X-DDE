"""Initial calculated 3D from a complex public ligand, through the existing native queue."""

import hashlib
import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pose_minimization_fixture import public_material
from test_native_pose_minimization import wait_job

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_MINIMIZATION") != "1",
    reason="isolated remote scientific acceptance only",
)


def test_initial_3d_generation_preserves_complex_ligand_stereo_and_source(tmp_path):
    from opendde_workbench.api import create_app
    from opendde_workbench.settings import Settings

    evidence = Path("server_tests/evidence/pose-minimization")
    config = json.loads((evidence / "browser-config.json").read_text())
    original, source = public_material("jq1")
    folder = tmp_path / "fixture"
    folder.mkdir()
    (folder / "source.sdf").write_bytes(original)
    # Derive a labelled 2D input with native RDKit depiction, without pretending
    # that these coordinates are a real pose. The immutable CC0 source is retained.
    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--memory",
            "1g",
            "--cpus",
            "1",
            "-v",
            f"{folder.resolve()}:/case",
            config["chemistry_image"],
            "python",
            "-c",
            "from rdkit import Chem; from rdkit.Chem import rdDepictor; "
            "m=next(Chem.SDMolSupplier('/case/source.sdf',removeHs=False)); "
            "assert m.GetNumHeavyAtoms()>25; rdDepictor.Compute2DCoords(m); "
            "w=Chem.SDWriter('/case/drawing.sdf'); w.write(m); w.close()",
        ],
        check=True,
        timeout=120,
    )
    flat = (folder / "drawing.sdf").read_bytes()
    assert b"2D" in flat.splitlines()[1]
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        chemistry_image=config["chemistry_image"],
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        asset = client.post(
            "/api/assets?kind=ligand&name=JQ1-labelled-2D-input.sdf",
            content=flat + flat,
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        body = {"source": {"kind": "asset", "asset_id": asset["id"], "record": 1}}
        reply = client.post(
            "/api/research/poses/initial", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        assert reply.status_code == 200 and reply.json()["state"] == "task", reply.text
        job = reply.json()["job"]
        again = client.post(
            "/api/research/poses/initial", json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        assert again.json()["job"]["id"] == job["id"]
        wait_job(client, job["id"])
        report = client.get(f"/api/jobs/{job['id']}/result").json()
        assert report["initialization"] == "ETKDGv3" and report["initialization_seed"] == 2026
        assert report["options"]["initialize_3d"] and report["converged"]
        assert report["identity_preserved"] and report["coordinate_stereo_preserved"]
        assert report["energy_after"] < report["energy_before"]
        assert report["source"]["record"] == 1
        saved = client.post(f"/api/research/poses/{job['id']}/save", json={}).json()
        raw = client.get(f"/api/assets/{saved['pose']['reference']['asset_id']}").content
        assert hashlib.sha256(raw).hexdigest() == report["artifact_sha256"]
        assert b"3D" in raw.splitlines()[1]
        assert raw != flat and client.get(f"/api/assets/{asset['id']}").content == flat + flat
        qualified = client.post(
            "/api/research/poses/initial",
            json={"source": {"kind": "version", "version_id": saved["pose"]["id"]}},
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert qualified.json()["state"] == "ready" and qualified.json()["pose"] == saved["pose"]
        assert len(client.get("/api/jobs").json()) == 1
        (evidence / "initial-jq1-source.sdf").write_bytes(flat)
        (evidence / "initial-jq1-calculated.sdf").write_bytes(raw)
        (evidence / "initial-jq1-proof.json").write_text(
            json.dumps(
                {
                    "public_source": source,
                    "source_is_labelled_2d_derivative": True,
                    "original_bytes_preserved": True,
                    "result": report,
                    "saved": saved,
                    "deduplicated": True,
                },
                indent=2,
            )
        )
