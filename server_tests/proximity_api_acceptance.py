"""Actual installer, Router/Worker, asset lineage and immutable public ternary case."""

import hashlib
import json
import os
import shutil
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.examples.bundle import export_bundle, restore_bundle, verify_examples
from opendde_workbench.examples.catalogue import FILES
from opendde_workbench.integrations.contract import IntegratedTask
from opendde_workbench.integrations.specs import PROGRAMS
from opendde_workbench.proximity.options import TernaryPayload
from opendde_workbench.settings import Settings


def wait_deployment(client, identifiers):
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        value = client.get("/api/deployment").json()
        selected = [row for row in value["operations"] if row["id"] in identifiers]
        if any(row["state"] in {"failed", "cancelled", "paused"} for row in selected):
            raise AssertionError(selected)
        if len(selected) == len(identifiers) and all(
            row["state"] == "succeeded" for row in selected
        ):
            return value
        time.sleep(0.25)
    raise TimeoutError("Reviewed ternary installation did not complete.")


def run_platform(protocol):
    if os.environ.get("CI") != "true":
        raise RuntimeError("Native scientific execution belongs in isolated CI.")
    output = protocol / "platform"
    output.mkdir()
    settings = Settings(
        state_dir=output / "state",
        image_file=output / "missing-image",
        code_file=output / "missing-code",
        model_dir=output / "models",
        cache_dir=output / "cache",
        minimum_free_bytes=0,
    )
    cache = settings.state_dir / "public-example-cache"
    cache.mkdir(parents=True)
    for key, source in (
        ("ternary_vhl", "protein1.pdb"),
        ("ternary_brd4", "protein2.pdb"),
        ("ternary_mz1", "ligand.sdf"),
    ):
        spec = FILES[key]
        copied = protocol / "inputs" / source
        assert hashlib.sha256(copied.read_bytes()).hexdigest() == spec.sha256
        shutil.copyfile(copied, cache / spec.sha256)
        shutil.copyfile(copied, output / spec.name)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        configured = client.post(
            "/api/deployment/config",
            json={"location": str(output / "components"), "automatic": False},
        )
        assert configured.status_code == 200, configured.text
        components = Path(configured.json()["config"]["root"])
        downloads = components / "downloads"
        downloads.mkdir(exist_ok=True)
        spec = PROGRAMS["deepternary"]
        shutil.copyfile(
            protocol / "source.zip", downloads / ("deepternary-" + spec["version"] + ".zip")
        )
        resource = spec["models"][0]
        shutil.copyfile(
            protocol / "models.zip",
            downloads / ("deepternary-" + resource["sha256"][:16] + "-" + resource["name"]),
        )
        queued = client.post("/api/deployment/packages/deepternary/install", json={})
        assert queued.status_code == 200, queued.text
        installed = wait_deployment(client, queued.json()["operations"])
        entry = installed["installed"]["deepternary"]
        assert client.get("/api/capabilities/deepternary.model").json()["availability"][
            "configuration_present"
        ]
        prepared = client.post("/api/examples/deepternary.model/prepare")
        assert prepared.status_code == 200, prepared.text
        objects = prepared.json()["objects"]
        inputs = [
            {"role": role, "source": objects[key]["reference"]}
            for role, key in (
                ("partner_a", "ternary_vhl"),
                ("partner_b", "ternary_brd4"),
                ("ligand", "ternary_mz1"),
            )
        ]
        task = IntegratedTask(
            operation="ternary_model",
            name="MZ1–BRD4–VHL · native fixed module",
            inputs=inputs,
            scientific_inputs=[item["source"] for item in inputs],
            payload=TernaryPayload(
                input_mode="shared_complex",
                partner_a_chain="A",
                partner_b_chain="B",
                partner_a_name="VHL",
                partner_b_name="BRD4",
                samples=3,
                attempt_budget=3,
                wall_seconds=600,
                binding_region_a=list(range(32)),
                binding_region_b=list(range(42, 69)),
            ),
            options={"device": "cpu", "cpu": 2, "memory_mib": 6144, "seed": 31},
        ).model_dump(mode="json")
        key = str(uuid4())
        submitted = client.post("/api/jobs", json=task, headers={"Idempotency-Key": key})
        assert submitted.status_code == 201, submitted.text
        identifier = submitted.json()["id"]
        assert (
            client.post("/api/jobs", json=task, headers={"Idempotency-Key": key}).json()["id"]
            == identifier
        )
        deadline = time.monotonic() + 660
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.25)
        assert job["status"] == "succeeded", client.get("/api/jobs/" + identifier + "/logs").text
        response = client.get("/api/jobs/" + identifier + "/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert len(result["proximity"]["assemblies"]) == 3
        indexed = client.post("/api/jobs/" + identifier + "/index-assets")
        assert indexed.status_code == 200 and indexed.json()["state"] == "complete", indexed.text
        reused = client.get("/api/research/objects?source_job=" + identifier).json()
        assert len([obj for obj in reused if obj["kind"] in {"structure", "molecule"}]) == len(
            result["candidates"]
        )
        for name, checksum in result["artifact_sha256"].items():
            downloaded = client.get("/api/jobs/" + identifier + "/download", params={"name": name})
            assert (
                downloaded.status_code == 200
                and hashlib.sha256(downloaded.content).hexdigest() == checksum
            )
        from proximity_result_negatives import check_forgery

        check_forgery(client, settings.state_dir, identifier, result, task)
        pin = client.post("/api/examples/deepternary.model/pin", json={"job_id": identifier})
        assert pin.status_code == 200, pin.text
    bundle = output / "x-dde-proximity-cases-v1.zip"
    revision = os.environ["GITHUB_SHA"]
    export_bundle(settings, bundle, revision, capabilities=("deepternary.model",))
    checksum = hashlib.sha256(bundle.read_bytes()).hexdigest()
    cold = replace(settings, state_dir=output / "cold-state")
    first = restore_bundle(bundle, cold, checksum)
    assert restore_bundle(bundle, cold, checksum) == first
    assert verify_examples(cold, ("deepternary.model",)) == {
        "modules": 1,
        "computed": 1,
        "validated": 0,
    }
    with TestClient(create_app(cold), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/jobs").json() == []
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
    receipt = {
        "source_revision": revision,
        "job_id": identifier,
        "immutable_image": entry["image"],
        "native_installer": True,
        "native_queue_and_supervisor": True,
        "idempotent_submission": True,
        "qualified": len(result["candidates"]) // 2,
        "assemblies": 3,
        "changed_input_output_and_graph_rejected": True,
        "cold_restore": True,
        "repeat_restore_identical": True,
        "personal_jobs_added": 0,
        "scientific_accuracy_accepted": False,
        "owner_inference": False,
        "archive": {"file": bundle.name, "sha256": checksum, "bytes": bundle.stat().st_size},
    }
    (output / "result.json").write_text(json.dumps(result))
    (output / "acceptance.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))
    return output
