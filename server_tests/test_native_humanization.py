"""Real offline Sapiens/ANARCII/Promb through the single API/Router/Worker/SQLite chain."""

import json
import os
from pathlib import Path
from uuid import uuid4

import pytest
from humanization_native_fixture import assert_native_reference, direct_reference
from test_native_antibodies import wait_job

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_HUMANIZATION") != "1",
    reason="Scientific models run only on CI or the target server",
)


def test_actual_reference_frameworks_original_versions_api_restart_and_tamper(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.humanization.manifest import METADATA_DIGEST, VERSIONS
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.settings import Settings
    from opendde_workbench.store import Store

    root = tmp_path / "components"
    root.mkdir()
    installed = install("sapiens", root, {}, str(uuid4()), lambda message: None, lambda: None)
    assert installed["provisioning"]["engine"] == "x-dde"
    fixtures = tmp_path / "native-reference"
    fixtures.mkdir()
    direct_reference(installed["image"], fixtures)
    original = (fixtures / "input.fasta").read_bytes()
    direct = json.loads((fixtures / "direct.json").read_text())
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        sapiens_image=installed["image"],
    )
    identifiers = []
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        assert client.get("/api/health").json()["engines"]["sapiens"]["ready"]
        uploaded = client.post(
            "/api/assets?kind=sequences&name=variable-regions.fasta", content=original
        )
        assert uploaded.status_code == 201, uploaded.text
        saved = client.post(
            "/api/research/objects",
            json={
                "asset_id": uploaded.json()["id"],
                "kind": "sequence",
                "label": "Original variable regions",
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert saved.status_code == 201, saved.text
        source = saved.json()["reference"]
        for options in (
            {"mode": "evaluate"},
            {"mode": "framework", "max_mutations": 3, "iterations": 2},
            {"format": "vhh_exploratory"},
        ):
            body = {
                "operation": "antibody_humanize",
                "sequences": source,
                "scientific_inputs": [source],
                "options": options,
            }
            key = str(uuid4())
            response = client.post("/api/jobs", json=body, headers={"Idempotency-Key": key})
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            identifiers.append(identifier)
            assert (
                client.post("/api/jobs", json=body, headers={"Idempotency-Key": key}).json()["id"]
                == identifier
            )
            completed = wait_job(client, identifier)
            assert completed["status"] == "succeeded", client.get(
                f"/api/jobs/{identifier}/logs"
            ).json()["text"]
            response = client.get(f"/api/jobs/{identifier}/result")
            assert response.status_code == 200, response.text
            result = response.json()
            assert result["versions"] == VERSIONS and result["metadata_sha256"] == METADATA_DIGEST
            assert result["source"] == source and [row["record"] for row in result["rows"]] == [
                0,
                1,
                2,
            ]
            rows = {row["source_id"]: row for row in result["rows"]}
            assert (
                rows["unsupported"]["status"] == "failed"
                and not rows["unsupported"]["original_scores"]
            )
            assert_native_reference(rows["heavy"], direct["heavy"])
            if options.get("format") == "vhh_exploratory":
                assert rows["light"]["status"] == "failed" and not result["proposal_count"]
            else:
                assert_native_reference(rows["light"], direct["light"])
            output = settings.state_dir / "jobs" / identifier / "output"
            assert not list(output.glob("domain-*.fasta"))
            if options.get("mode") == "framework":
                assert result["proposal_count"] >= 1
                for row in result["rows"]:
                    if not row["proposal"]:
                        continue
                    before, after = row["source_sequence"], row["proposal"]
                    changed = [
                        i for i, (a, b) in enumerate(zip(before, after, strict=True)) if a != b
                    ]
                    assert 1 <= len(changed) <= 3 and before.count("C") == after.count("C")
                    for residue in row["numbering"]:
                        i = residue["source_position"] - 1
                        if residue["region"] != "framework" or before[i] == "C":
                            assert before[i] == after[i]
                    reference = row["reference"]
                    version = client.get("/api/research/objects/" + reference["version_id"]).json()
                    assert (
                        version["relation"] == "edited_from"
                        and version["parent_id"] == saved.json()["id"]
                    )
                    assert reference["sha256"] == row["artifact_sha256"]
                    assert version["validation"] == "native_edited"
                evidence = Path("server_tests/evidence/humanization-fixture")
                evidence.mkdir(parents=True, exist_ok=True)
                (evidence / "input.fasta").write_bytes(original)
                (evidence / "result.json").write_bytes((output / "result.json").read_bytes())
                for row in result["rows"]:
                    if row["artifact"]:
                        (evidence / row["artifact"]).write_bytes(
                            (output / row["artifact"]).read_bytes()
                        )
            else:
                assert not result["proposal_count"] and not list(output.glob("*.fasta"))
            assert client.post(f"/api/jobs/{identifier}/index-assets").json()["state"] == "complete"
            store = Store(settings.state_dir / "jobs.sqlite3")
            inputs = AssetStore(store, settings.state_dir / "assets")
            versions = ScientificStore(store, inputs).list(limit=200, source_job=identifier)
            assert (
                len([version for version in versions if version.kind == "sequence"])
                == result["proposal_count"]
            )
            assert inputs.path(inputs.get(source["asset_id"])).read_bytes() == original
        token = client.headers.pop("X-Workbench-CSRF")
        assert client.post("/api/jobs", json=body).status_code == 403
        client.headers["X-Workbench-CSRF"] = token
        for invalid in (
            {"mode": "framework", "max_mutations": 3, "format": "vhh_exploratory"},
            {"max_mutations": 1},
            {"cpu": 3},
            {"checkpoint_path": "/new/model"},
        ):
            assert (
                client.post(
                    "/api/jobs",
                    json={**body, "options": invalid},
                    headers={"Idempotency-Key": str(uuid4())},
                ).status_code
                == 422
            )
        empty_upload = client.post(
            "/api/assets?kind=sequences&name=unsupported.fasta",
            content=b">unsupported\n" + b"X" * 80 + b"\n",
        )
        assert empty_upload.status_code == 201, empty_upload.text
        empty = empty_upload.json()
        empty_ref = {
            "asset_id": empty["id"],
            "sha256": empty["sha256"],
            "record": 0,
            "conformer": 0,
            "version_id": None,
        }
        response = client.post(
            "/api/jobs",
            json={
                "operation": "antibody_humanize",
                "sequences": empty_ref,
                "scientific_inputs": [empty_ref],
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert response.status_code == 201, response.text
        empty_id = response.json()["id"]
        assert wait_job(client, empty_id)["status"] == "succeeded"
        empty_result = client.get(f"/api/jobs/{empty_id}/result").json()
        assert empty_result["classification"] == "empty" and not empty_result["sapiens_executed"]
        assert (
            not empty_result["proposal_count"]
            and empty_result["rows"][0]["original_scores"] is None
        )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        for identifier in identifiers:
            assert client.get(f"/api/jobs/{identifier}/result").status_code == 200
        identifier = identifiers[1]
        output = settings.state_dir / "jobs" / identifier / "output"
        report = json.loads((output / "result.json").read_text())
        candidate = next(row for row in report["rows"] if row["artifact"])
        file = output / candidate["artifact"]
        content = file.read_bytes()
        file.write_bytes(content + b"changed")
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
        file.write_bytes(content)
        corrupted = json.loads(json.dumps(report))
        row = next(row for row in corrupted["rows"] if row["artifact"])
        row["original_evaluation"]["mean_native_residue_probability"] += 0.01
        (output / "result.json").write_text(json.dumps(corrupted))
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 422
        (output / "result.json").write_text(json.dumps(report))
        assert client.get(f"/api/jobs/{identifier}/result").status_code == 200
