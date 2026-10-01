"""Actual structural installer/container/Router/Worker/API/DB and immutable handoff."""

import json
import os
import shutil
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_RECEPTORS") != "1", reason="remote native acceptance only"
)


def test_actual_receptor_environment_and_reusable_persistent_alignment_collection(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.receptors.image import lock_digest
    from opendde_workbench.settings import Settings

    root = tmp_path / "components"
    root.mkdir()
    progress = []
    installed = install("biopython", root, {}, str(uuid4()), progress.append, lambda: None)
    assert (
        installed["runtime_lock_sha256"] == lock_digest()
        and installed["provisioning"]["engine"] == "x-dde"
    )
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        biopython_image=installed["image"],
    )
    fixture = Path("server_tests/evidence/core-fixture/receptor-inputs")
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        versions = []
        for name in ("reference.pdb", "moving.pdb"):
            response = client.post(
                "/api/assets?kind=structure&name=" + name,
                content=(fixture / name).read_bytes(),
                headers={"Content-Type": "application/octet-stream"},
            )
            assert response.status_code == 201, response.text
            version = client.post(
                "/api/research/objects",
                json={"asset_id": response.json()["id"], "kind": "structure", "label": name},
                headers={"Idempotency-Key": str(uuid4())},
            )
            assert version.status_code == 201, version.text
            versions.append(version.json())
        body = {
            "operation": "receptor_ensemble",
            "name": "actual receptor ensemble",
            "inputs": [
                {"structure": v["reference"], "selection": {"profile": "experimental"}}
                for v in versions
            ],
        }
        denied = client.post(
            "/api/jobs",
            json=body,
            headers={"Idempotency-Key": str(uuid4()), "X-Workbench-CSRF": "bad"},
        )
        assert denied.status_code == 403
        response = client.post("/api/jobs", json=body, headers={"Idempotency-Key": str(uuid4())})
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            job = client.get(f"/api/jobs/{identifier}").json()
            if job["status"] in {"succeeded", "failed"}:
                break
            time.sleep(0.1)
        assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert (
            result["qualified_count"] == 2
            and result["members"][1]["transformation"]["rmsd_angstrom"] < 0.003
        )
        collections = client.get(f"/api/research/receptor-ensembles?source_job={identifier}").json()
        assert len(collections) == 1
        record = collections[0]
        assert all(m["reference"]["version_id"] for m in record["members"])
        for index, member in enumerate(record["members"]):
            saved = client.get("/api/research/objects/" + member["reference"]["version_id"]).json()
            assert saved["parent_id"] == versions[index]["id"]
        assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
        assert client.get(f"/api/research/receptor-ensembles/{record['id']}").json() == record
        assert any(
            n["kind"] == "receptor_ensemble"
            for n in client.get("/api/research/graph").json()["nodes"]
        )
        output = settings.state_dir / "jobs" / identifier / "output"
        assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
        assert (
            json.loads((output.parent / "biopython-execution.json").read_text())["image"]
            == installed["image"]
        )
        destination = Path("server_tests/evidence/core-fixture/receptor-ensemble")
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "result.json").write_text(json.dumps(result))
        for name in ("reference.pdb", "moving.pdb"):
            shutil.copyfile(fixture / name, destination / name)
        for row in result["members"]:
            shutil.copyfile(output / row["artifact"], destination / row["artifact"])
        prepared_body = {
            "operation": "structure_prepare",
            "structure": versions[0]["reference"],
            "scientific_inputs": [versions[0]["reference"]],
            "options": {
                "model_index": 0,
                "chains": ["A"],
                "waters": False,
                "heterogens": "keep",
                "format": "cif",
            },
        }
        prepare_key = str(uuid4())
        response = client.post(
            "/api/jobs", json=prepared_body, headers={"Idempotency-Key": prepare_key}
        )
        assert response.status_code == 201, response.text
        prepared_id = response.json()["id"]
        assert (
            client.post(
                "/api/jobs", json=prepared_body, headers={"Idempotency-Key": prepare_key}
            ).json()["id"]
            == prepared_id
        )
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            prepared_job = client.get(f"/api/jobs/{prepared_id}").json()
            if prepared_job["status"] in {"succeeded", "failed"}:
                break
            time.sleep(0.1)
        assert prepared_job["status"] == "succeeded", client.get(
            f"/api/jobs/{prepared_id}/logs"
        ).json()["text"]
        response = client.get(f"/api/jobs/{prepared_id}/result")
        assert response.status_code == 200, response.text
        prepared = response.json()
        assert (
            prepared["inspection"]["selected_chains"] == ["A"]
            and prepared["reference"]["version_id"]
        )
        saved = client.get("/api/research/objects/" + prepared["reference"]["version_id"]).json()
        assert saved["parent_id"] == versions[0]["id"] and saved["relation"] == "prepared_from"
        assert client.post(f"/api/jobs/{prepared_id}/index-assets").json()["state"] == "complete"
        prepared_output = settings.state_dir / "jobs" / prepared_id / "output"
        # Independent parsing of the exported format in the already verified native image.
        prepare_fixture = Path("server_tests/evidence/core-fixture/structure-preparation")
        prepare_fixture.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            prepared_output / prepared["artifact"], prepare_fixture / prepared["artifact"]
        )
        shutil.copyfile(fixture / "reference.pdb", prepare_fixture / "reference.pdb")
        (prepare_fixture / "result.json").write_text(json.dumps(prepared))
        original_prepared = (prepared_output / prepared["artifact"]).read_bytes()
        (prepared_output / prepared["artifact"]).write_bytes(b"changed")
        assert client.get(f"/api/jobs/{prepared_id}/result").status_code == 422
        (prepared_output / prepared["artifact"]).write_bytes(original_prepared)
        (output / result["members"][1]["artifact"]).write_text("changed")
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        assert client.get(f"/api/research/receptor-ensembles/{record['id']}").json() == record
