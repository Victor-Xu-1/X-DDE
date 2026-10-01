"""Actual managed Biopython -> P2Rank -> site-set API/Store, on remote CPU only."""

import json
import os
import shutil
import sqlite3
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_SITES") != "1", reason="remote native acceptance only"
)


def execute(args, timeout=3600):
    return subprocess.run(
        [str(a) for a in args], check=True, capture_output=True, text=True, timeout=timeout
    ).stdout


def wait(client, identifier):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        job = client.get("/api/jobs/" + identifier).json()
        if job["status"] in {"succeeded", "failed", "cancelled"}:
            assert job["status"] == "succeeded", client.get(
                "/api/jobs/" + identifier + "/logs"
            ).text
            return job
        time.sleep(0.1)
    raise AssertionError("Native site-source job exceeded its bounded acceptance deadline.")


def test_actual_aligned_pockets_association_provenance_and_persistent_reuse(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.deployment.pocket_install import install_pockets
    from opendde_workbench.pockets.manifest import JAVA_IMAGE
    from opendde_workbench.settings import Settings

    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    root, work = tmp_path / "components", tmp_path / "install"
    root.mkdir()
    work.mkdir()
    bio = install("biopython", root, {}, str(uuid4()), lambda _: None, lambda: None)
    install_pockets("p2rank-compute", root, work, execute, lambda _: None, lambda: None)
    pocket = install_pockets("p2rank", root, work, execute, lambda _: None, lambda: None)
    source = Path(pocket["source"])
    examples = list(source.rglob("1fbl.pdb"))
    assert len(examples) == 1
    raw = examples[0].read_text()
    # Controlled rigid translation retains the real upstream example; not a biological
    # conformational benchmark. The native aligner must remove this reference-frame offset.
    lines = []
    for line in raw.splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            xyz = [
                float(line[a:b]) + delta for a, b, delta in ((30, 38, 7), (38, 46, -3), (46, 54, 5))
            ]
            line = line[:30] + "".join(f"{v:8.3f}" for v in xyz) + line[54:]
        lines.append(line)
    translated = "\n".join(lines) + "\n"
    settings = Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
        biopython_image=bio["image"],
        p2rank_home=source,
        p2rank_image=JAVA_IMAGE,
        p2rank_manifest_sha256=pocket["manifest_sha256"],
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        refs = []
        for name, data in (("1fbl-reference.pdb", raw), ("1fbl-translated.pdb", translated)):
            uploaded = client.post(
                "/api/assets?kind=structure&name=" + name,
                content=data.encode(),
                headers={"Content-Type": "application/octet-stream"},
            )
            assert uploaded.status_code == 201, uploaded.text
            version = client.post(
                "/api/research/objects",
                json={"asset_id": uploaded.json()["id"], "kind": "structure", "label": name},
                headers={"Idempotency-Key": str(uuid4())},
            )
            assert version.status_code == 201, version.text
            refs.append(version.json()["reference"])
        created = client.post(
            "/api/jobs",
            json={
                "operation": "receptor_ensemble",
                "name": "原生跨构象口袋来源",
                "inputs": [{"structure": r} for r in refs],
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert created.status_code == 201, created.text
        alignment = created.json()["id"]
        wait(client, alignment)
        ensemble = client.get("/api/research/receptor-ensembles?source_job=" + alignment).json()[0]
        assert ensemble["qualified_count"] == 2
        source_jobs = []
        for index, member in enumerate(ensemble["members"]):
            response = client.post(
                "/api/jobs",
                json={
                    "operation": "pocket_search",
                    "name": "受体" + str(index + 1) + "原生口袋",
                    "protein": member["reference"],
                    "profile": "experimental",
                    "threads": 2,
                    "review_limit": 10,
                },
                headers={"Idempotency-Key": str(uuid4())},
            )
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            wait(client, identifier)
            result = client.get("/api/jobs/" + identifier + "/result").json()
            assert result["native_pocket_count"] > 0 and result["pockets"][0]["residues"]
            source_jobs.append(identifier)
        body = {"ensemble_id": ensemble["id"], "pocket_jobs": source_jobs}
        key = str(uuid4())
        response = client.post(
            "/api/research/site-sets",
            json=body,
            headers={"Idempotency-Key": key, "X-Workbench-CSRF": "bad"},
        )
        assert response.status_code == 403
        response = client.post(
            "/api/research/site-sets", json=body, headers={"Idempotency-Key": key}
        )
        assert response.status_code == 201, response.text
        record = response.json()
        assert any(
            r["status"] == "associated"
            and r["shared_residues"] >= 2
            and r["center_distance"] < 0.01
            for r in record["relations"]
        )
        assert all(
            o["protein"] == ensemble["members"][o["member_index"]]["reference"]
            for o in record["observations"]
        )
        assert (
            record["surface_volume"] == "not_computed" and record["accessibility"] == "not_computed"
        )
        assert (
            client.post(
                "/api/research/site-sets", json=body, headers={"Idempotency-Key": key}
            ).json()
            == record
        )
        assert (
            client.post(
                "/api/research/site-sets",
                json={**body, "name": "changed"},
                headers={"Idempotency-Key": key},
            ).status_code
            == 409
        )
        assert client.get("/api/research/site-sets/" + record["id"]).json() == record
        assert any(
            n["kind"] == "binding_site_set"
            for n in client.get("/api/research/graph").json()["nodes"]
        )
        # Altering a normalized claim must fail against the actual native CSV.
        report = settings.state_dir / "jobs" / source_jobs[0] / "output" / "result.json"
        original = report.read_bytes()
        changed = json.loads(original)
        changed["pockets"][0]["center_x"] += 50
        report.write_text(json.dumps(changed))
        assert (
            client.post(
                "/api/research/site-sets", json=body, headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 422
        )
        report.write_bytes(original)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        assert client.get("/api/research/site-sets/" + record["id"]).json() == record
    destination = Path("server_tests/evidence/core-fixture/site-association")
    destination.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(settings.state_dir / "jobs.sqlite3") as db:
        with sqlite3.connect(destination / "jobs.sqlite3") as backup:
            db.backup(backup)
    shutil.copytree(settings.state_dir / "assets", destination / "assets", dirs_exist_ok=True)
    for identifier in [alignment, *source_jobs]:
        output = settings.state_dir / "jobs" / identifier / "output"
        target = destination / "jobs" / identifier / "output"
        target.mkdir(parents=True, exist_ok=True)
        for file in output.iterdir():
            if file.is_file() and not file.is_symlink():
                shutil.copyfile(file, target / file.name)
        if (output / "native").is_dir():
            (target / "native").mkdir(exist_ok=True)
            for file in (output / "native").glob("*.csv"):
                shutil.copyfile(file, target / "native" / file.name)
    (destination / "acceptance.json").write_text(
        json.dumps(
            {
                "alignment_job": alignment,
                "ensemble_id": ensemble["id"],
                "site_set_id": record["id"],
                "source_jobs": source_jobs,
                "scientific_scope": "actual native rigid-frame reuse, not biological calibration",
            }
        )
    )
