"""Remote native quality profiles, installer and persisted source evidence."""

import hashlib
import json
import os
import shutil
import subprocess
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_QUALITY") != "1",
    reason="Scientific native checks run only in CI/target server",
)


def wait_job(client, identifier):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        job = client.get("/api/jobs/" + identifier).json()
        if job["status"] not in {"queued", "running"}:
            return job
        time.sleep(0.2)
    raise AssertionError("Quality task exceeded its native acceptance budget")


def test_actual_quality_three_profiles_reject_distorted_geometry_and_retain_versions(tmp_path):
    from fastapi.testclient import TestClient
    from test_native_docking import upstream_fixture

    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.quality.manifest import CHECKS
    from opendde_workbench.settings import Settings

    root = tmp_path / "components"
    root.mkdir()
    installed = install("posebusters", root, {}, str(uuid4()), lambda message: None, lambda: None)
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        posebusters_image=installed["image"],
    )
    originals = {
        "molecule": b"invalid first record\n$$$$\n" + upstream_fixture("184l_lig.sdf"),
        "protein": upstream_fixture("184l_rec.pdb"),
    }
    identifiers = []
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        assert client.get("/api/health").json()["environments"]["posebusters"]["ready"]
        refs = {}
        for role, raw in originals.items():
            kind = "structure" if role == "protein" else "ligand"
            filename = "quality-protein.pdb" if role == "protein" else "quality-molecule.sdf"
            response = client.post(f"/api/assets?kind={kind}&name={filename}", content=raw)
            assert response.status_code == 201, response.text
            asset = response.json()
            version = client.post(
                "/api/research/versions",
                json={
                    "asset_id": asset["id"],
                    "kind": "structure" if role == "protein" else "molecule",
                    "label": filename,
                    "record": 0 if role == "protein" else 1,
                    "relation": "derived_from",
                },
            )
            assert version.status_code == 201, version.text
            refs[role] = version.json()["reference"]
        rejected = {
            "operation": "pose_quality",
            "name": "Frame must be explicit",
            "molecule": refs["molecule"],
            "protein": refs["protein"],
            "scientific_inputs": [refs["molecule"], refs["protein"]],
            "options": {"profile": "dock"},
        }
        assert client.post("/api/jobs", json=rejected).status_code == 422
        for profile in ("mol", "dock", "redock"):
            selected = {
                "molecule": refs["molecule"],
                **({"protein": refs["protein"]} if profile != "mol" else {}),
                **({"reference": refs["molecule"]} if profile == "redock" else {}),
            }
            body = {
                "operation": "pose_quality",
                "name": "Real " + profile,
                "options": {"profile": profile},
                **selected,
                "scientific_inputs": list(selected.values()),
                "coordinate_basis": None if profile == "mol" else "user_confirmed",
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
            job = wait_job(client, identifier)
            assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()[
                "text"
            ]
            response = client.get(f"/api/jobs/{identifier}/result")
            assert response.status_code == 200, response.text
            result = response.json()
            assert tuple(row["id"] for row in result["checks"]) == CHECKS[profile]
            assert (
                result["inputs"] == selected
                and result["versions"]["posebusters"] == "0.6.5"
                and result["inputs"]["molecule"]["record"] == 1
            )
            assert result["classification"] in {"passes", "fails", "incomplete"}
            if profile == "redock":
                assert (
                    next(row for row in result["checks"] if row["id"] == "rmsd_≤_2å")["outcome"]
                    == "pass"
                )
                fixture = Path("server_tests/evidence/quality-fixture")
                fixture.mkdir(parents=True, exist_ok=True)
                (fixture / "result.json").write_text(json.dumps(result))
                (fixture / "molecule.sdf").write_bytes(originals["molecule"])
                (fixture / "protein.pdb").write_bytes(originals["protein"])
                output = settings.state_dir / "jobs" / identifier / "output"
                for name in result["previews_sha256"]:
                    shutil.copyfile(output / name, fixture / name)
            versions = client.get(f"/api/research/objects?source_job={identifier}").json()
            assert len(versions) == 1 and versions[0]["kind"] == "analysis"
            for ref in refs.values():
                raw = client.get("/api/assets/" + ref["asset_id"]).content
                assert hashlib.sha256(raw).hexdigest() == ref["sha256"]
        # Distort an actual molecule with the real locked RDKit implementation, not a mocked report.
        script = """import sys
from io import BytesIO
from rdkit import Chem
m=list(Chem.ForwardSDMolSupplier(BytesIO(sys.stdin.buffer.read()),removeHs=False))[0]
for i in range(m.GetNumAtoms()):m.GetConformer().SetAtomPosition(i,(0.,0.,0.))
print(Chem.MolToMolBlock(m)+'\\n$$$$\\n')
"""
        native = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-i",
                "--network",
                "none",
                installed["image"],
                "python",
                "-c",
                script,
            ],
            input=upstream_fixture("184l_lig.sdf"),
            capture_output=True,
            check=True,
        )
        response = client.post("/api/assets?kind=ligand&name=distorted.sdf", content=native.stdout)
        assert response.status_code == 201, response.text
        asset = response.json()
        source = {
            "asset_id": asset["id"],
            "sha256": asset["sha256"],
            "record": 0,
            "conformer": 0,
            "version_id": None,
        }
        response = client.post(
            "/api/jobs",
            json={
                "operation": "pose_quality",
                "name": "Deliberate geometry failure",
                "molecule": source,
                "scientific_inputs": [source],
            },
        )
        assert response.status_code == 201, response.text
        distorted = response.json()["id"]
        assert wait_job(client, distorted)["status"] == "succeeded", client.get(
            f"/api/jobs/{distorted}/logs"
        ).json()
        report = client.get(f"/api/jobs/{distorted}/result").json()
        assert report["classification"] == "fails"
        assert (
            next(row for row in report["checks"] if row["id"] == "bond_lengths")["outcome"]
            == "fail"
        )
        assert report["checks"][-1]["outcome"] in {"fail", "unavailable"}
        index = client.post(f"/api/jobs/{distorted}/index-assets", json={}).json()
        assert index["state"] == "complete" and not index["errors"]
        (Path("server_tests/evidence") / "quality-acceptance.json").write_text(
            json.dumps(
                {
                    "jobs": identifiers,
                    "distorted": report,
                    "image": installed["image"],
                    "owner_execution": False,
                },
                indent=2,
            )
        )
        client.headers.pop("X-Workbench-CSRF")
        assert client.post("/api/jobs", json=body).status_code == 403
    with TestClient(create_app(replace(settings)), base_url="http://127.0.0.1:4320") as client:
        assert all(
            client.get(f"/api/jobs/{identifier}/result").status_code == 200
            for identifier in identifiers
        )
        output = settings.state_dir / "jobs" / identifiers[-1] / "output"
        preview = output / "molecule-preview.sdf"
        content = preview.read_bytes()
        preview.write_bytes(content + b"tamper")
        assert client.get(f"/api/jobs/{identifiers[-1]}/result").status_code == 422
        preview.write_bytes(content)
        assert client.get(f"/api/jobs/{identifiers[-1]}/result").status_code == 200
