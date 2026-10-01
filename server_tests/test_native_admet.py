"""Real offline ADMET-AI inference, shared API/SQLite lifecycle, exact records and previews."""

import json
import os
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_ADMET") != "1",
    reason="Native models run only on CI or the target server",
)


def wait_job(client, identifier):
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        job = client.get("/api/jobs/" + identifier).json()
        if job["status"] not in {"queued", "running"}:
            return job
        time.sleep(0.2)
    raise AssertionError("Native ADMET execution exceeded its acceptance budget")


def generate_native_fixture(image, directory):
    """Use actual native RDKit and direct upstream model as the reference implementation."""
    script = """import json
from pathlib import Path
from rdkit import Chem
from admet_ai import ADMETModel
from admet_ai.constants import DEFAULT_DRUGBANK_PATH
import torch
assert not DEFAULT_DRUGBANK_PATH.exists()
torch.set_num_threads(2)
torch.set_num_interop_threads(1)
writer = Chem.SDWriter('/output/valid.sdf')
for smiles,name in [('CCO','=1+1'),('CCO','Duplicate ethanol'),
                    ('CC(=O)Oc1ccccc1C(=O)O','Aspirin'),('CCO.[Na+]','Disconnected input')]:
    mol=Chem.MolFromSmiles(smiles); mol.SetProp('_Name',name); writer.write(mol)
writer.close()
raw=b'invalid first record\\n$$$$\\n'+Path('/output/valid.sdf').read_bytes()
Path('/output/source.sdf').write_bytes(raw)
smiles=[Chem.MolToSmiles(Chem.MolFromSmiles(s),isomericSmiles=True)
        for s in ['CCO','CC(=O)Oc1ccccc1C(=O)O']]
model=ADMETModel(include_physchem=False,drugbank_path=None,num_workers=0)
table=model.predict(smiles)
expected={s:{k:float(v) for k,v in table.loc[s].items()} for s in smiles}
Path('/output/direct.json').write_text(json.dumps(expected,allow_nan=False))
"""
    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--user",
            f"{os.getuid()}:{os.getgid()}",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--memory",
            "4g",
            "--cpus",
            "2",
            "--pids-limit",
            "64",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=256m",
            "--env",
            "HOME=/tmp",
            "--mount",
            f"type=bind,source={directory},target=/output",
            "--entrypoint",
            "python",
            image,
            "-B",
            "-c",
            script,
        ],
        check=True,
        timeout=240,
    )


def test_real_native_model_records_api_store_restart_and_tamper(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.admet.manifest import ENDPOINTS
    from opendde_workbench.api import create_app
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.settings import Settings
    from opendde_workbench.store import Store

    root = tmp_path / "components"
    root.mkdir()
    installed = install("admet", root, {}, str(uuid4()), lambda message: None, lambda: None)
    fixtures = tmp_path / "native-source"
    fixtures.mkdir()
    generate_native_fixture(installed["image"], fixtures)
    raw = (fixtures / "source.sdf").read_bytes()
    direct = json.loads((fixtures / "direct.json").read_text())
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image",
        code_file=tmp_path / "code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        admet_image=installed["image"],
    )
    store = Store(settings.state_dir / "jobs.sqlite3")
    identifiers, bodies = [], []
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        assert client.get("/api/health").json()["environments"]["admet"]["ready"]
        response = client.post("/api/assets?kind=ligand&name=admet-source.sdf", content=raw)
        assert response.status_code == 201, response.text
        asset = response.json()
        version = client.post(
            "/api/research/objects",
            json={
                "asset_id": asset["id"],
                "kind": "molecule",
                "label": "Original ethanol",
                "record": 1,
                "relation": "derived_from",
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert version.status_code == 201, version.text
        ref = version.json()["reference"]
        library = {"asset_id": asset["id"], "sha256": asset["sha256"]}
        for source in (
            {"library": library, "scientific_inputs": []},
            {"molecule": ref, "scientific_inputs": [ref]},
        ):
            body = {
                "operation": "admet_predict",
                "name": "Actual native ADMET",
                "options": {"view": "all"},
                **source,
            }
            key = str(uuid4())
            response = client.post("/api/jobs", json=body, headers={"Idempotency-Key": key})
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            identifiers.append(identifier)
            bodies.append(body)
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
            assert len(result["endpoints"]) == 41 and result["versions"]["admet-ai"] == "2.0.1"
            assert (
                result["drugbank_reference"] == "disabled"
                and result["uncertainty"] == "not_provided_by_native_api"
            )
            rows = result["rows"]
            if "library" in source:
                assert [row["record"] for row in rows] == [0, 1, 2, 3, 4]
                assert result["classification"] == "partial" and result["predicted_count"] == 3
                assert rows[0]["reason"] == "invalid_sdf_record" and not rows[0]["predictions"]
                assert (
                    rows[2]["duplicate_of_record"] == 1
                    and rows[4]["reason"] == "disconnected_components_require_preparation"
                )
                assert rows[1]["preview"] == "source-record-2.sdf"
                assert (
                    rows[1]["reference"]["record"] == 1
                    and rows[1]["reference"]["sha256"] == asset["sha256"]
                )
                text = client.get(f"/api/jobs/{identifier}/download?name=predictions.csv").text
                assert "'=1+1" in text
            else:
                assert len(rows) == 1 and rows[0]["record"] == 1 and rows[0]["reference"] == ref
                assert result["classification"] == "complete"
            for row in rows:
                if row["status"] == "predicted":
                    assert set(row["predictions"]) == set(ENDPOINTS)
                    for endpoint, value in row["predictions"].items():
                        assert value == pytest.approx(
                            direct[row["smiles"]][endpoint], abs=1e-5, rel=1e-6
                        )
            assert client.get(f"/api/assets/{asset['id']}").content == raw
            saved = ScientificStore(store, AssetStore(store, settings.state_dir / "assets")).list(
                source_job=identifier
            )
            assert saved and all(item.kind == "analysis" for item in saved)
        token = client.headers.pop("X-Workbench-CSRF")
        assert (
            client.post(
                "/api/jobs", json=bodies[0], headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 403
        )
        client.headers["X-Workbench-CSRF"] = token
        invalid_asset = client.post(
            "/api/assets?kind=ligand&name=invalid-only.sdf",
            content=b"invalid first record\n$$$$\n",
        )
        assert invalid_asset.status_code == 201, invalid_asset.text
        invalid_source = invalid_asset.json()
        empty_job = client.post(
            "/api/jobs",
            json={
                "operation": "admet_predict",
                "library": {
                    "asset_id": invalid_source["id"],
                    "sha256": invalid_source["sha256"],
                },
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert empty_job.status_code == 201, empty_job.text
        empty_id = empty_job.json()["id"]
        assert wait_job(client, empty_id)["status"] == "succeeded"
        empty_result = client.get(f"/api/jobs/{empty_id}/result").json()
        assert empty_result["classification"] == "empty"
        assert not empty_result["models_executed"] and not empty_result["predicted_count"]
        assert empty_result["rows"][0]["predictions"] == {} and not empty_result["previews_sha256"]
        assert (
            client.post(
                "/api/jobs",
                json={**bodies[0], "options": {"cpu": 3}},
                headers={"Idempotency-Key": str(uuid4())},
            ).status_code
            == 422
        )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as restarted:
        identifier = identifiers[0]
        assert restarted.get(f"/api/jobs/{identifier}/result").status_code == 200
        output = settings.state_dir / "jobs" / identifier / "output"
        preview = output / "source-record-2.sdf"
        original = preview.read_bytes()
        preview.write_bytes(original + b"changed")
        assert restarted.get(f"/api/jobs/{identifier}/result").status_code == 422
        preview.write_bytes(original)
        assert restarted.get(f"/api/jobs/{identifier}/result").status_code == 200
        evidence = Path("server_tests/evidence/admet-fixture")
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "result.json").write_bytes((output / "result.json").read_bytes())
        (evidence / "source.sdf").write_bytes(raw)
        (evidence / "predictions.csv").write_bytes((output / "predictions.csv").read_bytes())
        for file in output.glob("source-record-*.sdf"):
            (evidence / file.name).write_bytes(file.read_bytes())
