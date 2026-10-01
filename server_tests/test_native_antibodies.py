"""Remote-only fixed CPU model, actual task/SQLite/version evidence and failure handling."""

import json
import os
import shutil
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_ANTIBODIES") != "1",
    reason="Native models run only in CI/target server",
)
LIGHT = (
    "DVVMTQTPLSLPVSLGDQASISCRSSQSLVHSNGNTYLNWYLQKAGQSPKLLIYKVSNRFSGVPD"
    "RFSGSGSGTDFTLKISRVEAEDLGIYFCSQTTHVPPTFGGGTKLEIKR"
)
HEAVY = (
    "EVQLVESGGGLVQPGGSLRLSCAASGFTFSSYAMSWVRQAPGKGLEWVSAISGSGGSTYYADSVK"
    "GRFTISRDNSKNTLYLQMNSLRAEDTAVYYCAKDRGGYYYGMDVWGQGTTVTVSS"
)


def wait_job(client, identifier):
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{identifier}").json()
        if job["status"] not in {"running", "queued"}:
            return job
        time.sleep(0.2)
    raise AssertionError("Native antibody task exceeded its test budget")


def test_actual_cpu_numbering_environment_original_intervals_assets_restart_and_tamper(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.antibodies.image import lock_digest
    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.settings import Settings

    root = tmp_path / "components"
    root.mkdir()
    installed = install("anarcii", root, {}, str(uuid4()), lambda message: None, lambda: None)
    assert (
        installed["runtime_lock_sha256"] == lock_digest()
        and installed["provisioning"]["engine"] == "x-dde"
    )
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        anarcii_image=installed["image"],
    )
    records = {"light": LIGHT, "heavy": HEAVY, "not-antibody": "A" * 80}
    raw = "".join(
        ">" + identifier + "\n" + sequence + "\n" for identifier, sequence in records.items()
    ).encode()
    identifiers = []
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        assert client.get("/api/health").json()["engines"]["anarcii"]["ready"]
        response = client.post(
            "/api/assets?kind=sequences&name=antibody-source.fasta",
            content=raw,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201, response.text
        source = client.post(
            "/api/research/objects",
            json={
                "asset_id": response.json()["id"],
                "kind": "sequence",
                "label": "Actual antibody input",
            },
            headers={"Idempotency-Key": str(uuid4())},
        ).json()
        for mode in ("accuracy", "speed"):
            body = {
                "operation": "antibody_number",
                "sequences": source["reference"],
                "scientific_inputs": [source["reference"]],
                "options": {"mode": mode},
            }
            token = client.headers.pop("X-Workbench-CSRF")
            assert client.post("/api/jobs", json=body).status_code == 403
            client.headers["X-Workbench-CSRF"] = token
            key = str(uuid4())
            response = client.post("/api/jobs", json=body, headers={"Idempotency-Key": key})
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            identifiers.append(identifier)
            assert (
                client.post("/api/jobs", json=body, headers={"Idempotency-Key": key}).json()["id"]
                == identifier
            )
            job = wait_job(client, identifier)
            assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()[
                "text"
            ]
            response = client.get(f"/api/jobs/{identifier}/result")
            assert response.status_code == 200, response.text
            result = response.json()
            domains = {row["source_id"]: row for row in result["domains"]}
            assert (
                set(domains) == set(records)
                and domains["light"]["chain_type"] == "K"
                and domains["heavy"]["chain_type"] == "H"
            )
            assert (
                not domains["not-antibody"]["available"]
                and domains["not-antibody"]["artifact"] is None
            )
            assert (
                result["versions"] == {"anarcii": "2.0.8", "torch": "2.8.0+cpu"}
                and len(result["weights_sha256"]) == 4
            )
            for name in ("light", "heavy"):
                domain = domains[name]
                assert domain["sequence"] == records[name][domain["start"] : domain["end"] + 1]
                assert domain["reference"]["version_id"] and {
                    row["region"] for row in domain["numbering"]
                } >= {"CDR1", "CDR2", "CDR3", "framework"}
                saved = client.get(
                    "/api/research/objects/" + domain["reference"]["version_id"]
                ).json()
                assert saved["parent_id"] == source["id"] and saved["relation"] == "prepared_from"
            assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
            output = settings.state_dir / "jobs" / identifier / "output"
            if mode == "accuracy":
                fixture = Path("server_tests/evidence/antibody-fixture")
                fixture.mkdir(parents=True, exist_ok=True)
                (fixture / "input.fasta").write_bytes(raw)
                (fixture / "result.json").write_text(json.dumps(result))
                for domain in result["domains"]:
                    if domain["available"]:
                        shutil.copyfile(output / domain["artifact"], fixture / domain["artifact"])
            file = output / domains["heavy"]["artifact"]
            original = file.read_bytes()
            file.write_bytes(b"changed")
            assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
            assert client.post(f"/api/jobs/{identifier}/index-assets").json()["errors"]
            file.write_bytes(original)
        # scFv split keeps exact intervals in the original full sequence.
        scfv = (">linked\n" + HEAVY + "GGGGSGGGGSGGGGS" + LIGHT + "\n").encode()
        response = client.post(
            "/api/assets?kind=sequences&name=scfv.fasta",
            content=scfv,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201, response.text
        asset = response.json()
        ref = {"asset_id": asset["id"], "sha256": asset["sha256"], "record": 0, "conformer": 0}
        response = client.post(
            "/api/jobs",
            json={
                "operation": "antibody_number",
                "sequences": ref,
                "scientific_inputs": [ref],
                "options": {"scfv": True},
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        identifiers.append(identifier)
        assert wait_job(client, identifier)["status"] == "succeeded", client.get(
            f"/api/jobs/{identifier}/logs"
        ).json()["text"]
        result = client.get(f"/api/jobs/{identifier}/result").json()
        assert len(result["domains"]) == 2 and {row["chain_type"] for row in result["domains"]} == {
            "H",
            "K",
        }
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        for identifier in identifiers:
            assert client.get(f"/api/jobs/{identifier}/result").status_code == 200
