"""Actual installer -> Router -> container -> supervisor -> API -> persistence."""

import hashlib
import json
import os
import shutil
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.deployment.installers import install
from opendde_workbench.settings import Settings

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_SURFACE") != "1", reason="explicit remote native acceptance only"
)


def finished(client, identifier):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        job = client.get("/api/jobs/" + identifier).json()
        if job["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.15)
    assert job["status"] == "succeeded", client.get("/api/jobs/" + identifier + "/logs").text
    result = client.get("/api/jobs/" + identifier + "/result")
    assert result.status_code == 200, result.text
    return result.json()


def test_real_brd4_case_through_existing_queue_and_immutable_evidence(tmp_path):
    root = tmp_path / "components"
    root.mkdir()
    installed = install("biopython", root, {}, str(uuid4()), lambda message: None, lambda: None)
    os.environ["WB_BIOPYTHON_IMAGE"] = installed["image"]
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a") as f:
            f.write("WB_BIOPYTHON_IMAGE=" + installed["image"] + "\n")
    settings = replace(
        Settings.from_env(), biopython_image=installed["image"], minimum_free_bytes=0
    )
    evidence = Path("server_tests/evidence/surface")
    evidence.mkdir(parents=True, exist_ok=True)
    raw = Path("server_tests/fixtures/surface-3mxf.pdb").read_bytes()
    assert (
        hashlib.sha256(raw).hexdigest()
        == "534dcb8ea9fa29956249b5133b22187c3867363b16a6b98dd8219c18c5d3250f"
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4334") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        response = client.post(
            "/api/assets?kind=structure&name=BRD4-JQ1-3MXF.pdb",
            content=raw,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201, response.text
        original_upload = response.json()
        example_response = client.post("/api/examples/biopython.exposure/prepare")
        assert example_response.status_code == 200, example_response.text
        example = example_response.json()
        ref = example["objects"]["brd4"]["reference"]
        source = client.get("/api/assets/" + ref["asset_id"] + "/metadata").json()
        assert source["sha256"] == original_upload["sha256"]
        preparation = {
            "operation": "structure_prepare",
            "name": "BRD4–JQ1 experimental altloc A",
            "structure": ref,
            "scientific_inputs": [ref],
            "options": {"alternate": "A", "waters": False, "heterogens": "keep", "format": "pdb"},
        }
        created = client.post(
            "/api/jobs", json=preparation, headers={"Idempotency-Key": str(uuid4())}
        )
        assert created.status_code == 201, created.text
        prepare_id = created.json()["id"]
        prepared = finished(client, prepare_id)
        assert prepared["resolved_alternates"] and prepared["reference"]["version_id"]
        pinned = client.post("/api/examples/biopython.prepare/pin", json={"job_id": prepare_id})
        assert pinned.status_code == 200, pinned.text
        exact = prepared["reference"]
        body = {
            "operation": "surface_exposure",
            "name": "BRD4–JQ1 region exposure",
            "structure": exact,
            "scientific_inputs": [exact],
            "regions": [{"chain": "A", "number": 1, "resname": "JQ1"}],
        }
        denied = client.post(
            "/api/jobs",
            json=body,
            headers={"X-Workbench-CSRF": "bad", "Idempotency-Key": str(uuid4())},
        )
        assert denied.status_code == 403
        wrong = json.loads(json.dumps(body))
        wrong["structure"]["sha256"] = "f" * 64
        wrong["scientific_inputs"] = [wrong["structure"]]
        assert (
            client.post(
                "/api/jobs", json=wrong, headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 422
        )
        key = str(uuid4())
        created = client.post("/api/jobs", json=body, headers={"Idempotency-Key": key})
        assert created.status_code == 201, created.text
        identifier = created.json()["id"]
        assert (
            client.post("/api/jobs", json=body, headers={"Idempotency-Key": key}).json()["id"]
            == identifier
        )
        result = finished(client, identifier)
        assert result["versions"] == {"biopython": "1.88"} and result["target_atoms"] > 25
        assert 0 < result["assembly_area"] < result["isolated_area"]
        output = settings.state_dir / "jobs" / identifier / "output"
        for name, expected in result["artifacts"].items():
            response = client.get(f"/api/jobs/{identifier}/download", params={"path": name})
            assert response.status_code == 200, response.text
            assert hashlib.sha256(response.content).hexdigest() == expected
            shutil.copyfile(output / name, evidence / name)
        assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
        nodes = client.get("/api/research/graph").json()
        assert any(
            edge["source"] == "object:" + exact["version_id"]
            and edge["target"] == "task:" + identifier
            for edge in nodes["edges"]
        )
        adapter = output.parent / "adapter"
        for name in ("native_surface.py", "surface_options.py"):
            assert (adapter / name).read_bytes() == (
                Path("src/opendde_workbench/receptors") / name
            ).read_bytes()
        assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
        (evidence / "result.json").write_text(json.dumps(result, indent=2))
        structure = client.get("/api/assets/" + exact["asset_id"]).content
        (evidence / "prepared-case.pdb").write_bytes(structure)
        (evidence / "session.json").write_text(
            json.dumps(
                {
                    "job_id": identifier,
                    "preparation_job_id": prepare_id,
                    "source_pdb": "3MXF",
                    "original_sha256": source["sha256"],
                    "prepared_source": exact,
                    "scientific_execution": "actual_native_biopython_in_isolated_container",
                }
            )
        )
        pinned = client.post("/api/examples/biopython.exposure/pin", json={"job_id": identifier})
        assert pinned.status_code == 200, pinned.text
        assert client.get("/api/examples/biopython.exposure").json()["computed_result_available"]
        assert not any(j["id"] in {identifier, prepare_id} for j in client.get("/api/jobs").json())
        from opendde_workbench.examples.bundle import export_bundle

        exported = export_bundle(
            settings,
            evidence / "x-dde-surface-cases-v1.zip",
            os.environ.get("GITHUB_SHA", "native-server-check"),
            capabilities=["biopython.exposure"],
        )
        (evidence / "bundle-receipt.json").write_text(json.dumps(exported, indent=2))
        original = (output / "atoms.csv").read_bytes()
        (output / "atoms.csv").write_bytes(b"changed")
        assert client.get("/api/jobs/" + identifier + "/result").status_code == 422
        (output / "atoms.csv").write_bytes(original)
        assert (
            hashlib.sha256(client.get("/api/assets/" + source["id"]).content).hexdigest()
            == source["sha256"]
        )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4334") as client:
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
