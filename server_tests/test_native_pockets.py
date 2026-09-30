"""Real native P2Rank model in its offline Docker environment; remote CI only."""

import os
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_POCKETS") != "1",
    reason="Native pocket acceptance runs on the remote runner.",
)


def test_real_p2rank_program_and_shared_asset_handoff(tmp_path, monkeypatch):
    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.pocket_install import install_pockets
    from opendde_workbench.pockets.manifest import JAVA_IMAGE
    from opendde_workbench.settings import Settings

    root = tmp_path / "components"
    work = tmp_path / "install"
    work.mkdir()

    def execute(args, timeout=3600):
        return subprocess.run(
            [str(a) for a in args], check=True, capture_output=True, text=True, timeout=timeout
        ).stdout

    # Isolated runner HOME keeps large native environments outside the repository.
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    install_pockets("p2rank-compute", root, work, execute, lambda message: None, lambda: None)
    installed = install_pockets("p2rank", root, work, execute, lambda message: None, lambda: None)
    source = Path(installed["source"])
    candidates = list(source.rglob("1fbl.pdb"))
    if not candidates:
        raise AssertionError("Reviewed upstream example is missing from the release.")
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        p2rank_home=source,
        p2rank_image=JAVA_IMAGE,
        p2rank_manifest_sha256=installed["manifest_sha256"],
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        uploaded = client.post(
            "/api/assets?kind=structure&name=1fbl.pdb",
            content=candidates[0].read_bytes(),
            headers={"Content-Type": "application/octet-stream"},
        )
        assert uploaded.status_code == 201
        asset = uploaded.json()
        response = client.post(
            "/api/jobs",
            json={
                "operation": "pocket_search",
                "name": "native remote acceptance",
                "protein": {"asset_id": asset["id"], "sha256": asset["sha256"]},
                "profile": "experimental",
                "threads": 2,
                "review_limit": 10,
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 201, response.text
        id = response.json()["id"]
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + id).json()
            if job["status"] not in {"queued", "running", "cancelling"}:
                break
            time.sleep(0.1)
        if job["status"] != "succeeded":
            log = client.get("/api/jobs/" + id + "/logs").json()["text"]
            print(log)
            evidence = Path("server_tests/evidence")
            evidence.mkdir(exist_ok=True)
            (evidence / "native-pocket.log").write_text(log)
        assert job["status"] == "succeeded"
        result = client.get("/api/jobs/" + id + "/result").json()
        assert result["native_pocket_count"] > 0 and result["pockets"][0]["residues"]
        assert all(0 <= site["probability"] <= 1 for site in result["pockets"])
        assert (
            client.get("/api/jobs/" + id + "/environment").json()["specification"][
                "scientific_software"
            ]
            == "p2rank"
        )
        versions = client.get("/api/research/objects").json()
        assert any(v["source_job"] == id and v["kind"] == "analysis" for v in versions)
