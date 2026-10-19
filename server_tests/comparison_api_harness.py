"""Actual API/Router/Worker/scientific-asset handoff in the isolated comparison runtime gate."""

import json
import os
import time
from uuid import uuid4

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.settings import Settings


def verify_api(root, image, reference, moving, options, evidence):
    settings = Settings(
        state_dir=root / "api-state",
        image_file=root / "unused-image",
        code_file=root / "unused-code",
        model_dir=root / "unused-models",
        cache_dir=root / "api-cache",
        minimum_free_bytes=0,
        biopython_image=image,
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        versions = []
        for label, source in (("reference", reference), ("moving", moving)):
            response = client.post(
                "/api/assets?kind=structure&name=" + label + source.suffix,
                content=source.read_bytes(),
                headers={"Content-Type": "application/octet-stream"},
            )
            assert response.status_code == 201, response.text
            version = client.post(
                "/api/research/objects",
                json={"asset_id": response.json()["id"], "kind": "structure", "label": label},
                headers={"Idempotency-Key": str(uuid4())},
            )
            assert version.status_code == 201, version.text
            versions.append(version.json())
        sources = [version["reference"] for version in versions]
        body = {
            "operation": "structure_compare",
            "name": "Geometric control, not a research example",
            "reference": sources[0],
            "moving": sources[1],
            "options": options,
            "scientific_inputs": sources,
        }
        denied = client.post(
            "/api/jobs",
            json=body,
            headers={"Idempotency-Key": str(uuid4()), "X-Workbench-CSRF": "invalid"},
        )
        assert denied.status_code == 403
        key = str(uuid4())
        response = client.post("/api/jobs", json=body, headers={"Idempotency-Key": key})
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        assert (
            client.post("/api/jobs", json=body, headers={"Idempotency-Key": key}).json()["id"]
            == identifier
        )
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            job = client.get(f"/api/jobs/{identifier}").json()
            if job["status"] in {"succeeded", "failed", "interrupted", "cancelled"}:
                break
            time.sleep(0.1)
        assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert abs(result["geometry"]["partner_rmsd_angstrom"] - 8) < 0.001
        assert set(result["derived_references"]) == {"reference", "moving"}
        for index, role in enumerate(("reference", "moving")):
            version = client.get(
                "/api/research/objects/" + result["derived_references"][role]["version_id"]
            ).json()
            assert version["parent_id"] == versions[index]["id"]
            assert version["relation"] == "prepared_from" and version["source_job"] == identifier
        before = client.get(f"/api/research/objects?source_job={identifier}").json()
        assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
        assert client.get(f"/api/research/objects?source_job={identifier}").json() == before
        output = settings.state_dir / "jobs" / identifier / "output"
        assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
        assert (
            json.loads((output.parent / "biopython-execution.json").read_text())["image"] == image
        )
        artifact = output / "moving-aligned.cif"
        raw = artifact.read_bytes()
        artifact.write_bytes(b"changed")
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
        artifact.write_bytes(raw)
        (evidence / "api-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200 and response.json() == result
    if os.environ.get("WB_TEST_COMPARISON_BROWSER") == "1":
        from comparison_browser_harness import verify_browser

        verify_browser(settings.state_dir, identifier, result, evidence)
