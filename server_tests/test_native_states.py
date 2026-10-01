"""Actual locked chemistry container through Router/Worker/API/Store and indexed collections."""

import json
import os
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_STATES") != "1", reason="remote native acceptance only"
)

SDF = """ethanol
 X-DDE native state fixture

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
$$$$
"""


def test_real_offline_state_container_indexes_a_persistent_reusable_collection(tmp_path):
    import time

    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.chemistry.image import lock_digest
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.settings import Settings

    root = tmp_path / "components"
    root.mkdir()
    progress = []
    installed = install("chemistry", root, {}, str(uuid4()), progress.append, lambda: None)
    image = installed["image"]
    assert installed["runtime_lock_sha256"] == lock_digest()
    assert installed["provisioning"]["engine"] == "x-dde"
    assert (Path(installed["directory"]) / "image-context/requirements.txt").is_file()
    assert progress
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        chemistry_image=image,
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        asset = client.post(
            "/api/assets?kind=ligand&name=ethanol.sdf",
            content=SDF.encode(),
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        version = client.post(
            "/api/research/objects",
            json={"asset_id": asset["id"], "kind": "molecule", "label": "native state input"},
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        body = {
            "operation": "molecular_states",
            "name": "actual native chemistry preparation",
            "molecule": version["reference"],
            "options": {
                "protonation": False,
                "tautomers": False,
                "stereoisomers": False,
                "max_states": 1,
                "conformers_per_state": 2,
                # Preserve two initializations for the downstream native pose matrix.
                "prune_rmsd": 0,
            },
        }
        response = client.post("/api/jobs", json=body, headers={"Idempotency-Key": str(uuid4())})
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            job = client.get(f"/api/jobs/{identifier}").json()
            if job["status"] in {"succeeded", "failed"}:
                break
            time.sleep(0.1)
        assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
        result = client.get(f"/api/jobs/{identifier}/result")
        assert result.status_code == 200, result.text
        result = result.json()
        assert len(result["states"]) == 1 and result["conformers"]
        assert result["geometry_frame"] == "unbound_conformer"
        collections = client.get(f"/api/research/state-sets?source_job={identifier}").json()
        assert len(collections) == 1 and collections[0]["members"][0]["conformers"]
        original = collections[0]
        assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
        assert client.get(f"/api/research/state-sets/{original['id']}").json() == original
        graph = client.get("/api/research/graph").json()
        assert any(n["kind"] == "molecular_state_set" for n in graph["nodes"])
        output = settings.state_dir / "jobs" / identifier / "output"
        assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
        assert (
            json.loads((output.parent / "chemistry-execution.json").read_text())["image"] == image
        )
        # Same-run browser acceptance consumes actual native outputs, not invented states.
        import shutil

        fixture = Path("server_tests/evidence/core-fixture/molecular-states")
        fixture.mkdir(parents=True, exist_ok=True)
        (fixture / "input.sdf").write_text(SDF)
        (fixture / "result.json").write_text(json.dumps(result))
        for name in (
            result["state_artifact"],
            result["conformer_artifact"],
            *(c["artifact"] for c in result["conformers"]),
        ):
            shutil.copyfile(output / name, fixture / name)
        library_asset_response = client.post(
            "/api/assets?kind=ligand&name=early-library.sdf",
            content=(SDF + SDF).encode(),
            headers={"Content-Type": "application/octet-stream"},
        )
        assert library_asset_response.status_code == 201, library_asset_response.text
        library_asset = library_asset_response.json()
        screen_ids = []
        for mode in ("inventory", "similarity", "substructure", "diversity", "filter"):
            selected_query = (
                version["reference"] if mode in {"similarity", "substructure"} else None
            )
            screen_body = {
                "operation": "library_screen",
                "library": {"asset_id": library_asset["id"], "sha256": library_asset["sha256"]},
                "query": selected_query,
                "scientific_inputs": [selected_query] if selected_query else [],
                "options": {"mode": mode},
            }
            screen_key = str(uuid4())
            response = client.post(
                "/api/jobs", json=screen_body, headers={"Idempotency-Key": screen_key}
            )
            assert response.status_code == 201, response.text
            screen_id = response.json()["id"]
            assert (
                client.post(
                    "/api/jobs", json=screen_body, headers={"Idempotency-Key": screen_key}
                ).json()["id"]
                == screen_id
            )
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                screen_job = client.get(f"/api/jobs/{screen_id}").json()
                if screen_job["status"] in {"succeeded", "failed"}:
                    break
                time.sleep(0.1)
            assert screen_job["status"] == "succeeded", client.get(
                f"/api/jobs/{screen_id}/logs"
            ).json()["text"]
            response = client.get(f"/api/jobs/{screen_id}/result")
            assert response.status_code == 200, response.text
            screen = response.json()
            assert len(screen["rows"]) == 2 and not screen["rows"][1]["eligible"]
            assert client.post(f"/api/jobs/{screen_id}/index-assets").json()["state"] == "complete"
            if mode == "filter":
                assert not screen["selected_records"]
                assert {
                    v["kind"]
                    for v in client.get(
                        "/api/research/objects", params={"source_job": screen_id}
                    ).json()
                } == {"analysis"}
            else:
                assert (
                    screen["selected_records"] == [0]
                    and screen["rows"][0]["reference"]["version_id"]
                )
                selected_version = screen["rows"][0]["reference"]
                assert (
                    selected_version["record"] == 0
                    and selected_version["sha256"] == screen["sha256"]
                )
                if mode == "inventory":
                    screen_fixture = Path("server_tests/evidence/core-fixture/library-screen")
                    screen_fixture.mkdir(parents=True, exist_ok=True)
                    (screen_fixture / "result.json").write_text(json.dumps(screen))
                    (screen_fixture / "input.sdf").write_text(SDF + SDF)
                    screened_output = settings.state_dir / "jobs" / screen_id / "output"
                    shutil.copyfile(
                        screened_output / screen["artifact"], screen_fixture / screen["artifact"]
                    )
            screen_ids.append(screen_id)
        screen_output = settings.state_dir / "jobs" / screen_ids[0] / "output"
        original_selected = (screen_output / "selected.sdf").read_bytes()
        (screen_output / "selected.sdf").write_bytes(b"changed")
        assert client.get(f"/api/jobs/{screen_ids[0]}/result").status_code == 422
        (screen_output / "selected.sdf").write_bytes(original_selected)
        (output / "conformers.sdf").write_text("changed")
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        assert client.get(f"/api/research/state-sets/{original['id']}").json() == original
        for screen_id in screen_ids:
            assert client.get(f"/api/jobs/{screen_id}/result").status_code == 200
