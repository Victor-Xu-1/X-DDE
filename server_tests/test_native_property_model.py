"""Actual EGFR training, held-out evaluation and model reuse on the remote CPU runner."""

import hashlib
import os
import time
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_PROPERTY_MODEL") != "1",
    reason="Property model acceptance runs only on CI or the intended server",
)


def completed_result(client, request):
    response = client.post("/api/jobs", headers={"Idempotency-Key": str(uuid4())}, json=request)
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        job = client.get("/api/jobs/" + identifier).json()
        if job["status"] in {"succeeded", "failed"}:
            break
        time.sleep(0.2)
    assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
    response = client.get(f"/api/jobs/{identifier}/result")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["program"] == "chemprop" and result["complete"]
    for name, digest in result["artifact_sha256"].items():
        file = client.get(f"/api/jobs/{identifier}/download", params={"name": name})
        assert file.status_code == 200 and hashlib.sha256(file.content).hexdigest() == digest
    return identifier, result


def test_real_egfr_training_checkpoint_and_prediction_reuse(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.examples.catalogue import FILES
    from opendde_workbench.examples.files import verified_file
    from opendde_workbench.locations import atomic_json
    from opendde_workbench.settings import Settings

    root, state = tmp_path / "components", tmp_path / "state"
    root.mkdir()
    state.mkdir()
    installed = install("chemprop", root, {}, str(uuid4()), print, lambda: None)
    atomic_json(root / "installed.json", {"chemprop": installed})
    atomic_json(state / "deployment.json", {"root": str(root), "automatic": False})
    source = verified_file(tmp_path / "public", FILES["egfr_library"])
    settings = Settings(
        state_dir=state,
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        response = client.post(
            "/api/assets?kind=ligand&name=EGFR-experimental-library.sdf",
            content=source,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201, response.text
        asset = response.json()
        ref = {"asset_id": asset["id"], "sha256": asset["sha256"], "record": 0, "conformer": 0}
        request = {
            "operation": "chemprop_train",
            "name": "Experimental EGFR property model",
            "inputs": [{"role": "library", "source": ref}],
            "scientific_inputs": [ref],
            "payload": {"kind": "chemprop", "mode": "train", "epochs": 5},
            "options": {"cpu": 2, "memory_mib": 4096},
        }
        training_id, training = completed_result(client, request)
        assert len(training["validation_points"]) >= 2
        assert {m["name"] for m in training["metrics"]} >= {"Test RMSE", "Test MAE"}
        models = client.get("/api/scientific/property-models").json()["models"]
        assert len(models) == 1 and models[0]["job_id"] == training_id
        assert models[0]["sha256"] == training["artifact_sha256"][training["model_artifact"]]
        request.update(operation="chemprop_predict", name="Reuse the trained EGFR model")
        request["payload"] = {
            "kind": "chemprop",
            "mode": "predict",
            "model_job": training_id,
            "model_sha256": models[0]["sha256"],
        }
        _, predictions = completed_result(client, request)
        # Reuse-path acceptance, not an external predictive-accuracy benchmark.
        assert len(predictions["candidates"]) == 177
        assert all(c["metrics"][0]["unit"] == "pIC50" for c in predictions["candidates"])
        assert client.get(f"/api/assets/{asset['id']}").content == source
