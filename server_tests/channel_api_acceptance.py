"""Actual managed installer -> Router/Worker -> native supervisor -> immutable cases."""

import argparse
import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from uuid import uuid4

from channel_case_archive import freeze_channels
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.examples.catalogue import FILES
from opendde_workbench.examples.files import verified_file
from opendde_workbench.settings import Settings
from opendde_workbench.space.contract import ChannelTask
from opendde_workbench.space.manifest import VERSION


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", type=Path, required=True)
    args = parser.parse_args()
    protocol = args.protocol.resolve()
    output = protocol / "platform"
    output.mkdir(exist_ok=False)
    base = output / "components"
    settings = Settings(
        state_dir=output / "state",
        image_file=output / "missing-image",
        code_file=output / "missing-code",
        model_dir=output / "models",
        cache_dir=output / "cache",
        minimum_free_bytes=0,
    )
    settings.state_dir.mkdir()
    cache = settings.state_dir / "public-example-cache"
    cache.mkdir()
    shutil.copyfile(protocol / "4EY7.pdb", cache / FILES["ache"].sha256)
    verified_file(cache, FILES["donepezil"])
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        assert not client.get("/api/capabilities/caver.paths").json()["availability"][
            "configuration_present"
        ]
        configured = client.post(
            "/api/deployment/config", json={"location": str(base), "automatic": False}
        )
        assert configured.status_code == 200, configured.text
        components = Path(configured.json()["config"]["root"])
        (components / "downloads").mkdir()
        shutil.copyfile(
            protocol / "caver.zip", components / "downloads" / ("caver-" + VERSION + ".zip")
        )
        queued = client.post("/api/deployment/packages/caver/install", json={})
        assert queued.status_code == 200, queued.text
        operations = queued.json()["operations"]
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            deployment = client.get("/api/deployment").json()
            rows = [r for r in deployment["operations"] if r["id"] in operations]
            assert not any(r["state"] in {"failed", "cancelled", "paused"} for r in rows), rows
            if len(rows) == len(operations) and all(r["state"] == "succeeded" for r in rows):
                break
            time.sleep(0.25)
        else:
            raise TimeoutError("Managed channel installation did not finish")
        entry = deployment["installed"]["caver"]
        assert not deployment["restart_required"]
        assert client.get("/api/capabilities/caver.paths").json()["availability"][
            "configuration_present"
        ]
        prepared = client.post("/api/examples/caver.paths/prepare")
        assert prepared.status_code == 200, prepared.text
        example = prepared.json()
        ref = example["objects"]["ache"]["reference"]
        source = client.get("/api/assets/" + ref["asset_id"]).content
        assert hashlib.sha256(source).hexdigest() == FILES["ache"].sha256
        task = ChannelTask(
            structure=ref,
            scientific_inputs=[ref],
            starting_regions=[{"chain": "A", "number": 604, "resname": "E20"}],
            options={"context_chains": ["A"], "alternate": "A"},
        ).model_dump(mode="json")
        key = str(uuid4())
        submitted = client.post("/api/jobs", json=task, headers={"Idempotency-Key": key})
        assert submitted.status_code == 201, submitted.text
        identifier = submitted.json()["id"]
        assert (
            client.post("/api/jobs", json=task, headers={"Idempotency-Key": key}).json()["id"]
            == identifier
        )
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.2)
        assert job["status"] == "succeeded", client.get("/api/jobs/" + identifier + "/logs").text
        response = client.get("/api/jobs/" + identifier + "/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["channels"] and result["preparation"]["resolved_alternates"]
        indexed = client.post("/api/jobs/" + identifier + "/index-assets").json()
        assert indexed["state"] == "complete", indexed
        result = client.get("/api/jobs/" + identifier + "/result").json()
        assert result["prepared_reference"]["version_id"]
        objects = client.get("/api/research/objects?source_job=" + identifier).json()
        structures = [v for v in objects if v["kind"] == "structure"]
        assert len(structures) == 1 and structures[0]["validation"] == "native_prepared"
        assert structures[0]["parent_id"] == ref["version_id"]
        assert structures[0]["family_id"] == example["objects"]["ache"]["family_id"]
        assert structures[0]["reference"] == result["prepared_reference"]
        assert len([v for v in objects if v["kind"] == "analysis"]) == 1
        root = settings.state_dir / "jobs" / identifier / "output"
        for name, digest in result["artifacts"].items():
            response = client.get("/api/jobs/" + identifier + "/download", params={"name": name})
            assert (
                response.status_code == 200
                and hashlib.sha256(response.content).hexdigest() == digest
            )
        assert client.get("/api/assets/" + ref["asset_id"]).content == source
        # A changed scientific source must be rejected before native execution.
        changed = json.loads(json.dumps(task))
        changed["structure"]["sha256"] = "0" * 64
        changed["scientific_inputs"] = [changed["structure"]]
        assert (
            client.post(
                "/api/jobs", json=changed, headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 422
        )
        file = root / "channel-points.csv"
        original = file.read_bytes()
        try:
            file.write_bytes(b"x" + original[1:])
            assert client.get("/api/jobs/" + identifier + "/result").status_code == 422
        finally:
            file.write_bytes(original)
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
        # A well-formed JSON report may not move paths, invent radii or forge export hashes.
        report = root / "result.json"
        authored = report.read_bytes()
        for mode in ("coordinates", "radius", "frame", "download"):
            changed = json.loads(authored)
            if mode == "coordinates":
                changed["channels"][0]["points"][0]["position"][0] += 1
            elif mode == "radius":
                changed["channels"][0]["points"][0]["radius_angstrom"] = -1
            elif mode == "frame":
                changed["frame"]["basis"][0][0] += 0.1
            else:
                file.write_bytes(b"x" + original[1:])
                changed["artifacts"]["channel-points.csv"] = hashlib.sha256(
                    file.read_bytes()
                ).hexdigest()
            try:
                report.write_text(json.dumps(changed))
                assert client.get("/api/jobs/" + identifier + "/result").status_code == 422
            finally:
                report.write_bytes(authored)
                file.write_bytes(original)
        pin = client.post("/api/examples/caver.paths/pin", json={"job_id": identifier})
        assert pin.status_code == 200, pin.text
        assert (
            client.post("/api/examples/caver.paths/pin", json={"job_id": identifier}).json()
            == pin.json()
        )
        assert client.get("/api/jobs").json() == []
    archive = freeze_channels(settings, output, identifier, result)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/jobs/" + identifier + "/result").json() == result
        assert client.get("/api/examples/caver.paths").json()["computed_result_available"]
        assert client.get("/api/jobs").json() == []
    (output / "result.json").write_text(json.dumps(result))
    receipt = {
        "source_revision": os.environ["GITHUB_SHA"],
        "job_id": identifier,
        "native_queue_and_supervisor": True,
        "immutable_image": entry["image"],
        "channels": len(result["channels"]),
        "prepared_version": structures[0]["id"],
        "same_family_and_source": True,
        "personal_jobs_added": 0,
        "idempotent_submission": True,
        "restart_persistence": True,
        "changed_input_and_output_rejected": True,
        "archive": archive,
    }
    (output / "acceptance.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
