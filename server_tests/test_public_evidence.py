"""Actual public protocol -> Router/process -> SQLite/assets -> typed API -> lineage.

Only CI/target server runs this acceptance. These are database reads, not inference.
"""

import copy
import os
import time

import pytest
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.settings import Settings


@pytest.mark.skipif(
    os.environ.get("WB_TEST_PUBLIC_EVIDENCE") != "1",
    reason="Public protocol acceptance runs only on CI/target server",
)
def test_actual_target_sources_persistence_exact_sequence_and_tamper(tmp_path, monkeypatch):
    monkeypatch.setenv("WB_AUTO_DEPLOY", "0")
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
    )
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:4320") as client:
        token = client.get("/api/session").json()["csrf_token"]
        client.headers["X-Workbench-CSRF"] = token
        lookup = client.post(
            "/api/discovery/lookup",
            json={"entity": "target", "query": "KRAS", "allow_external": True},
        )
        assert lookup.status_code == 200, lookup.text
        selected = next(hit for hit in lookup.json()["hits"] if hit["name"] == "KRAS")
        payload = {
            "operation": "target_research",
            "name": "Real public evidence",
            "entity": "target",
            "identifier": selected["id"],
            "include_materials": True,
            "limit": 5,
            "allow_external": True,
        }
        client.headers["Idempotency-Key"] = "b3578714-57ca-4a20-8eac-a3e49dc834ef"
        response = client.post("/api/jobs", json=payload)
        assert response.status_code == 201, response.text
        job = response.json()
        identifier = job["id"]
        assert client.post("/api/jobs", json=payload).json()["id"] == identifier
        deadline = time.monotonic() + 160
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] not in {"running", "queued"}:
                break
            time.sleep(0.2)
        assert job["status"] == "succeeded", job
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["entity"]["id"] == selected["id"]
        assert result["entity"]["approvedSymbol"] == "KRAS"
        assert all(s["status"] == "ok" for s in result["sources"]), result["sources"]
        assert result["activities"]["rows"]
        material = result["materials"][0]
        assert material["accession"] == "P01116" and material["reference"]["version_id"]
        assert len(material["sequence"]) > 100
        objects = client.get("/api/research/objects", params={"source_job": identifier}).json()
        assert {obj["kind"] for obj in objects} == {"analysis", "sequence"}
        assert client.post(f"/api/jobs/{identifier}/index-assets").status_code == 200
        assert len(
            client.get("/api/research/objects", params={"source_job": identifier}).json()
        ) == len(objects)
        prediction = {
            "name": "Exact sequence handoff",
            "components": [
                {
                    "kind": "protein",
                    "value": material["sequence"],
                    "source_sequence": material["reference"]["asset_id"],
                }
            ],
            "scientific_inputs": [material["reference"]],
        }
        # Real asset-bound validation, without requesting OpenDDE inference.
        from opendde_workbench.assets import AssetStore
        from opendde_workbench.requests import TASK_ADAPTER
        from opendde_workbench.store import Store

        store = Store(settings.state_dir / "jobs.sqlite3")
        assets = AssetStore(store, settings.state_dir / "assets")
        assert assets.validate_bindings(TASK_ADAPTER.validate_python(prediction))
        changed = copy.deepcopy(prediction)
        changed["components"][0]["value"] = "A" * 100
        with pytest.raises(ValueError, match="differs"):
            assets.validate_bindings(TASK_ADAPTER.validate_python(changed))
        graph = client.get("/api/research/graph").json()
        assert any(edge["source"] == "task:" + identifier for edge in graph["edges"])
        assert (
            client.get(f"/api/jobs/{identifier}/environment").json()["specification"][
                "scientific_software"
            ]
            == "discovery"
        )
        file = settings.state_dir / "jobs" / identifier / "output/source-01.json"
        original = file.read_bytes()
        file.write_bytes(b"{}")
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
        assert client.post(f"/api/jobs/{identifier}/index-assets").json()["errors"]
        file.write_bytes(original)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 200
        assert len(
            client.get("/api/research/objects", params={"source_job": identifier}).json()
        ) == len(objects)
