"""Public therapeutic library through the real isolated container, Router, Worker and API."""

import json
import os
import shutil
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_LIBRARY") != "1", reason="remote native library acceptance only"
)


def wait_result(client, identifier):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{identifier}").json()
        if job["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.1)
    assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
    response = client.get(f"/api/jobs/{identifier}/result")
    assert response.status_code == 200, response.text
    return response.json()


def test_actual_abl_library_inspections_are_persistent_and_use_the_existing_environment(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.chemistry.backend import FILES
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.settings import Settings

    root = tmp_path / "components"
    root.mkdir()
    installed = install("chemistry", root, {}, str(uuid4()), lambda _: None, lambda: None)
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        chemistry_image=installed["image"],
    )
    raw = Path("server_tests/evidence/library-inputs/abl-inhibitors.sdf").read_bytes()
    records = []
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        upload = client.post(
            "/api/assets?kind=ligand&name=ABL-inhibitors.sdf",
            content=raw,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert upload.status_code == 201, upload.text
        asset = upload.json()
        for mode, policy in (("alerts", "warn"), ("scaffold", "off")):
            response = client.post(
                "/api/jobs",
                json={
                    "operation": "library_screen",
                    "name": f"ABL inhibitor {mode} review",
                    "library": {"asset_id": asset["id"], "sha256": asset["sha256"]},
                    "options": {"mode": mode, "alert_policy": policy, "per_scaffold": 1},
                },
                headers={"Idempotency-Key": str(uuid4())},
            )
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            result = wait_result(client, identifier)
            assert result["schema_version"] == 2 and len(result["rows"]) == 3
            assert result["selected_records"] == [0, 1, 2]
            assert all(row.get("reference", {}).get("version_id") for row in result["rows"])
            artifact = client.get(
                f"/api/jobs/{identifier}/download", params={"name": result["report_artifact"]}
            )
            assert artifact.status_code == 200, artifact.text
            assert "Structural alerts" in artifact.text
            output = settings.state_dir / "jobs" / identifier / "output"
            execution = json.loads((output.parent / "chemistry-execution.json").read_text())
            assert execution["image"] == installed["image"]
            assert set(execution["adapter_sha256"]) == set(FILES)
            assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
            assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
            target = Path("server_tests/evidence/library-container") / mode
            target.mkdir(parents=True, exist_ok=True)
            (target / "input.sdf").write_bytes(raw)
            (target / "result.json").write_text(json.dumps(result, indent=2))
            for name in (result["artifact"], result["report_artifact"]):
                shutil.copyfile(output / name, target / name)
            records.append(identifier)
        assert client.get(f"/api/assets/{asset['id']}").content == raw
        environment = client.get(f"/api/jobs/{records[0]}/environment").json()
        assert "chemistry" in json.dumps(environment)
