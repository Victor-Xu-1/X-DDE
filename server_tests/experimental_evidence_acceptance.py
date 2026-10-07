"""Real source/installer/API acceptance; no molecular model or inference is run."""

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.settings import Settings


def settings_at(state):
    return Settings(
        state_dir=state,
        image_file=state / "missing-image",
        code_file=state / "missing-code",
        model_dir=state / "models",
        cache_dir=state / "cache",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    state = output / "state"
    os.environ["WB_AUTO_DEPLOY"] = "0"
    settings = settings_at(state)
    receipt = {}
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        token = client.get("/api/session").json()["csrf_token"]
        headers = {"X-Workbench-CSRF": token}
        configured = client.post(
            "/api/deployment/config",
            json={"location": str(output / "components"), "automatic": False},
            headers=headers,
        )
        assert configured.status_code == 200, configured.text
        operations = client.post(
            "/api/deployment/packages/public-experimental-examples/install",
            json={},
            headers=headers,
        )
        assert operations.status_code == 200, operations.text
        editor = client.post("/api/deployment/packages/ketcher/install", json={}, headers=headers)
        assert editor.status_code == 200, editor.text
        ids = operations.json()["operations"] + editor.json()["operations"]
        until = time.monotonic() + 180
        while time.monotonic() < until:
            deployed = client.get("/api/deployment").json()
            rows = [row for row in deployed["operations"] if row["id"] in ids]
            assert not any(row["state"] in {"failed", "paused", "cancelled"} for row in rows), rows
            if len(rows) == len(ids) and all(row["state"] == "succeeded" for row in rows):
                break
            time.sleep(0.5)
        else:
            raise TimeoutError("The bounded public experimental case installation did not finish.")
        component = deployed["installed"]["public-experimental-examples"]
        assert component["observations"] == 177 and not component["scientific_inference"]
        example = client.get("/api/examples/experimental.evidence").json()
        assert example["computed_result_available"] and example["record_pin"]
        job_count = len(client.get("/api/jobs").json())
        prepared = client.post(
            "/api/examples/experimental.evidence/prepare", json={}, headers=headers
        )
        assert prepared.status_code == 200, prepared.text
        result = prepared.json()["record"]["value"]
        assert len(result["observations"]) == 177
        assert all(
            row["molecule"] and row["material_kind"] == "molecule" for row in result["observations"]
        )
        assert len({row["comparison_group"] for row in result["observations"]}) == 1
        assert result["summaries"][0]["endpoint"] == "IC50"
        identifier = result["id"]
        repeated = client.post(
            "/api/examples/experimental.evidence/prepare", json={}, headers=headers
        ).json()
        assert repeated["record"]["value"]["id"] == identifier
        assert len(client.get("/api/jobs").json()) == job_count
        raw = client.get("/api/assets/" + result["request"]["source"]["asset_id"]).content
        assert hashlib.sha256(raw).hexdigest() == result["source_sha256"]
        (output / "experimental-input.csv").write_bytes(raw)
        exported = client.get("/api/research/evidence/" + identifier + "/download")
        assert exported.status_code == 200 and "reported_relation" in exported.text
        graph = client.get(
            "/api/research/graph", params={"limit": 200, "focus": "evidence:" + identifier}
        )
        assert graph.status_code == 200, graph.text
        assert any(row["relation"] == "experimental_observation" for row in graph.json()["edges"])
        receipt = {
            "version": client.get("/api/health").json()["version"],
            "record": identifier,
            "reported_observations": 177,
            "independent_replicates_claimed": False,
            "source_csv_sha256": result["source_sha256"],
            "public_source_sha256": component["fixed_source_sha256"],
            "repeat_prepare_is_idempotent": True,
            "personal_jobs_added": 0,
            "graph_material_links": True,
            "native_model_inference": False,
            "measurement_source": "ChEMBL CHEMBL944276 / CC-BY-SA-3.0",
        }
        (output / "record.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        (output / "acceptance.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        reopened = client.get("/api/research/evidence/" + receipt["record"])
        assert reopened.status_code == 200 and len(reopened.json()["observations"]) == 177
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
