"""One bounded native STAT6 descriptor task for exact file/3D browser acceptance."""

import hashlib
import json
import os
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.installers import install
from opendde_workbench.examples.stat6.catalogue import FILES, verified_input
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true", "Isolated CI only"
    settings = Settings.from_env()
    runner = Path(os.environ["RUNNER_TEMP"]).resolve()
    assert settings.state_dir.resolve().is_relative_to(runner)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assert not store.list_jobs(), "Start with an isolated empty task authority"
    assets = AssetStore(store, settings.state_dir / "assets")
    # Original minimized warhead and PROTAC stay distinct files and identities.
    inputs = [
        assets.save(FILES[key].name, "ligand", verified_input(key))
        for key in ("study_ligand", "study_protac")
    ]
    originals = {asset.id: assets.path(asset).read_bytes() for asset in inputs}
    runtime = install("chemistry", runner / "property-preview-chemistry", {},
                      str(uuid4()), print, lambda: None)
    native_settings = replace(settings, chemistry_image=runtime["image"], job_timeout=120)
    with TestClient(create_app(native_settings), base_url=os.environ["WB_BROWSER_URL"]) as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        client.headers["Idempotency-Key"] = str(uuid4())
        response = client.post("/api/jobs", json={
            "operation": "properties", "name": "STAT6 · exact two-file descriptors",
            "ligand_files": [asset.id for asset in inputs],
        })
        assert response.status_code == 201, response.text
        job_id = response.json()["id"]
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + job_id).json()
            if job["status"] in {"succeeded", "failed", "cancelled", "interrupted"}:
                break
            time.sleep(0.2)
        assert job["status"] == "succeeded", job
        result = client.get("/api/jobs/" + job_id + "/result").json()
        assert [row["input"] for row in result["molecules"]] == [
            asset.id + ":1" for asset in inputs
        ]
        assert all(row["available"] for row in result["molecules"])
    assert len(store.list_jobs()) == 1 and store.get(job_id).status == "succeeded"
    for asset in inputs:
        assert assets.path(asset).read_bytes() == originals[asset.id]
        assert hashlib.sha256(originals[asset.id]).hexdigest() == asset.sha256
    evidence = Path("server_tests/evidence/property-preview")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "native-case.json").write_text(json.dumps({
        "job_id": job_id, "job": job, "result": result,
        "sources": [asset.model_dump(mode="json") for asset in inputs],
        "originals_unchanged": True, "maximum_tasks": 1,
        "native_compute_disabled_during_browser": True,
    }, indent=2), encoding="utf-8")
    print({"native_property_job": job_id, "molecules": len(inputs)})


if __name__ == "__main__":
    main()
