"""Remote-only real BRD4/JQ1 dynamics and official TYK2 OpenFE calculation chain."""

import hashlib
import json
import os
import shutil
import sqlite3
import time
from pathlib import Path
from uuid import uuid4

import pytest
from scientific_install_evidence import install_with_evidence

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_SIMULATIONS") != "1",
    reason="Native simulations run on CI or the intended scientific server only",
)


@pytest.mark.parametrize("capability", ["openmm.dynamics", "openfe.rbfe"])
def test_native_public_simulation_pipeline(tmp_path, capability):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.examples.preparation import prepare_example
    from opendde_workbench.locations import atomic_json
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.settings import Settings
    from opendde_workbench.store import Store

    fep = capability == "openfe.rbfe"
    program = "openfe" if fep else "openmm"
    root, state = tmp_path / "components", tmp_path / "state"
    root.mkdir()
    state.mkdir()
    installed = install_with_evidence(program, root, str(uuid4()))
    atomic_json(root / "installed.json", {program: installed})
    atomic_json(state / "deployment.json", {"root": str(root), "automatic": False})
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    prepared = prepare_example(capability, ScientificStore(store, assets), state / "public")
    original = {
        str(o.reference.asset_id): assets.path(assets.get(o.reference.asset_id)).read_bytes()
        for o in prepared.objects.values()
    }
    request = prepared.request
    request["options"] = {"device": "cpu", "cpu": 4, "memory_mib": 6144, "seed": 101}
    if fep:
        request["payload"].update(
            records=[0, 1],
            stage="plan",
            network="minimal",
            production_ns=0.02,
            equilibration_ns=0.02,
            repeats=1,
        )
    else:
        request["payload"].update(production_ns=0.004, equilibration_ns=0.002, frames=5, repeats=1)
    settings = Settings(
        state_dir=state,
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
    )
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]

        def submit(value, suffix):
            response = client.post(
                "/api/jobs", headers={"Idempotency-Key": str(uuid4())}, json=value
            )
            assert response.status_code == 201, response.text
            identifier = response.json()["id"]
            # Native CPU HREX holds eleven explicit-water replicas. The real
            # solvent leg completed in the earlier 45-minute gate while complex
            # minimization was still progressing; do not reduce physical sampling.
            deadline = time.monotonic() + (5400 if fep else 2700)
            next_progress = time.monotonic() + 60
            prepared_before_sampling = False
            while time.monotonic() < deadline:
                job = client.get("/api/jobs/" + identifier).json()
                if not fep:
                    native_output = state / "jobs" / identifier / "output"
                    prepared_system = native_output / "system.xml"
                    prepared_topology = native_output / "solvated-system.pdb"
                    if (
                        prepared_system.is_file()
                        and prepared_topology.is_file()
                        and prepared_system.stat().st_size > 1000
                        and prepared_topology.stat().st_size > 1000
                        and not list(native_output.glob("repeat-*-frame-*.pdb"))
                    ):
                        prepared_before_sampling = True
                if job["status"] in {"succeeded", "failed", "cancelled"}:
                    break
                if time.monotonic() >= next_progress:
                    print("Native task progress:", suffix, job["status"], flush=True)
                    native_log = client.get(f"/api/jobs/{identifier}/logs").json()["text"]
                    print("\n".join(native_log.splitlines()[-6:]), flush=True)
                    next_progress = time.monotonic() + 60
                time.sleep(0.5)
            if job["status"] != "succeeded":
                diagnostic = client.get(f"/api/jobs/{identifier}/logs").json()["text"]
                print(diagnostic[-16000:])
                failure_dir = Path("outputs/native-simulations") / (suffix + "-failure")
                failure_dir.mkdir(parents=True, exist_ok=True)
                (failure_dir / "native.log").write_text(diagnostic)
                (failure_dir / "request.json").write_text(json.dumps(job["request"]))
            assert job["status"] == "succeeded", (
                "Native simulation failed; see captured native diagnostics."
            )
            if not fep:
                assert prepared_before_sampling, (
                    "Matching prepared topology/system must be retained before production frames."
                )
            response = client.get(f"/api/jobs/{identifier}/result")
            assert response.status_code == 200, response.text
            report = response.json()
            output = state / "jobs" / identifier / "output"
            assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
            for name, sha in report["artifact_sha256"].items():
                download = client.get(f"/api/jobs/{identifier}/download", params={"name": name})
                assert (
                    download.status_code == 200
                    and hashlib.sha256(download.content).hexdigest() == sha
                )
            for identity, content in original.items():
                assert client.get("/api/assets/" + identity).content == content
            evidence = Path("outputs/native-simulations") / suffix
            evidence.mkdir(parents=True, exist_ok=True)
            shutil.copytree(output, evidence / "output", dirs_exist_ok=True)
            (evidence / "request.json").write_text(json.dumps(job["request"]))
            (evidence / "original-inputs.json").write_text(
                json.dumps(
                    {
                        identity: hashlib.sha256(content).hexdigest()
                        for identity, content in original.items()
                    }
                )
            )
            snapshot = evidence / "state"
            shutil.copytree(
                state,
                snapshot,
                dirs_exist_ok=True,
                ignore=shutil.ignore_patterns(
                    "jobs.sqlite3", "jobs.sqlite3-wal", "jobs.sqlite3-shm"
                ),
            )
            with store.connect() as db, sqlite3.connect(snapshot / "jobs.sqlite3") as saved:
                db.backup(saved)
            (evidence / "job-id.txt").write_text(identifier)
            return report

        report = submit(request, capability)
        if not fep:
            repeat = report["dynamics"]["replicas"][0]
            assert len(repeat["frames"]) == 5
            assert repeat["frames"][-1]["time_ns"] == 0.004
            assert any(frame["backbone_rmsd_angstrom"] > 0 for frame in repeat["frames"][1:])
            assert repeat["contacts"] and repeat["residues"]
        else:
            assert report["free_energy"]["stage"] == "plan"
            assert report["free_energy"]["edges"][0]["atom_map"]
            assert report["free_energy"]["edges"][0]["delta_delta_g_kcal_mol"] is None
            request["payload"]["stage"] = "calculate"
            report = submit(request, "openfe.calculation")
            edge = report["free_energy"]["edges"][0]
            assert edge["delta_delta_g_kcal_mol"] is not None
            assert edge["uncertainty_kcal_mol"] > 0
            assert set(edge["legs"]) == {"complex", "solvent"}
            assert all(len(leg["overlap"][0]) == 11 for leg in edge["legs"].values())
            # These are pipeline/diagnostic acceptance checks, not a scientific benchmark.
            assert report["free_energy"]["acceptance"] == "not_scientifically_accepted"
