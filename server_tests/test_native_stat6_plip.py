"""Deposited STAT6 mmCIF through the real PLIP image, task queue and downloads."""

import hashlib
import io
import json
import math
import os
import shutil
import time
from pathlib import Path
from uuid import uuid4

import pytest
from scientific_install_evidence import install_with_evidence

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_INTEGRATED_NATIVE_CPU") != "1"
    or os.environ.get("WB_SCIENTIFIC_PROGRAM") != "plip",
    reason="Only the explicitly selected real PLIP acceptance runs this public structure",
)


def verify_original_endpoints(result, source):
    from Bio.PDB import MMCIFParser

    model = MMCIFParser(QUIET=True).get_structure("STAT6", io.StringIO(source.decode()))[0]
    ligand = model["A"][("H_A1AQQ", 701, " ")]
    ligand_points = [atom.coord for atom in ligand.get_unpacked_list()]
    atomic_types = {"hydrophobic", "hydrogen_bond", "halogen_bond", "water_bridge"}
    checked = 0
    for row in result["interactions"]:
        assert math.isclose(
            row["distance"],
            math.dist(row["protein_position"], row["ligand_position"]),
            rel_tol=0,
            abs_tol=1e-9,
        )
        residue = model[row["chain"]][(" ", row["number"], " ")]
        assert residue.resname == row["residue"]
        if row["kind"] not in atomic_types:
            continue  # Ring/group centers are not falsely compared with individual atoms.
        protein_points = [atom.coord for atom in residue.get_unpacked_list()]
        assert min(math.dist(row["protein_position"], point) for point in protein_points) < 0.001
        assert min(math.dist(row["ligand_position"], point) for point in ligand_points) < 0.001
        checked += 1
    assert checked and any(row["kind"] == "hydrogen_bond" for row in result["interactions"])
    return {"atomic_contacts_checked": checked, "source_component": ligand.resname}


def retain_native_evidence(client, identifier, result, state, source, checks):
    evidence = Path("server_tests/evidence/stat6-plip")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "9BIG.cif").write_bytes(source)
    (evidence / "result.json").write_text(json.dumps(result, indent=2))
    for name, expected in result["artifact_sha256"].items():
        response = client.get(f"/api/jobs/{identifier}/download", params={"name": name})
        assert response.status_code == 200, response.text
        assert hashlib.sha256(response.content).hexdigest() == expected
        (evidence / name).write_bytes(response.content)
    directory = state / "jobs" / identifier
    for name in ("request.json", "native-exit.json", "plip-execution.json"):
        shutil.copyfile(directory / name, evidence / name)
    private = directory / "output/native-inputs"
    for name in ("structure.pdb", "structure-component-identifiers.json"):
        shutil.copyfile(private / name, evidence / name)
    receipt = json.loads((private / "structure-component-identifiers.json").read_text())
    assert receipt["component_aliases"] == {"A1AQQ": "X00"}
    assert receipt["source"]["sha256"] == hashlib.sha256(source).hexdigest()
    assert not any("component-identifiers" in name for name in result["artifact_sha256"])
    exit_ = json.loads((directory / "native-exit.json").read_text())
    assert exit_["ExitCode"] == 0 and not exit_["OOMKilled"]
    (evidence / "coordinate-review.json").write_text(json.dumps(checks, indent=2))


def require_native_success(client, job, state):
    if job["status"] == "succeeded":
        return
    evidence = Path("server_tests/evidence/stat6-plip")
    evidence.mkdir(parents=True, exist_ok=True)
    logs = client.get(f"/api/jobs/{job['id']}/logs").json()
    (evidence / "failed-job.json").write_text(json.dumps(job, indent=2))
    (evidence / "native-failure.log").write_text(logs["text"])
    print(logs["text"], flush=True)  # Do not lose the native exception in pytest's dict repr.
    directory = state / "jobs" / job["id"]
    for relative in (
        "request.json",
        "native-exit.json",
        "plip-execution.json",
        "output/native-inputs/structure.pdb",
        "output/native-inputs/structure-component-identifiers.json",
    ):
        source = directory / relative
        if source.is_file() and not source.is_symlink() and source.stat().st_size < 1024**2:
            shutil.copyfile(source, evidence / source.name)
    pytest.fail(
        "Native STAT6 PLIP failed; complete controlled diagnostics were retained.", pytrace=False
    )


def test_deposited_stat6_long_component_retains_original_frame_and_downloadable_cif(tmp_path):
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.examples.files import verified_file
    from opendde_workbench.examples.stat6.catalogue import FILES
    from opendde_workbench.locations import atomic_json
    from opendde_workbench.settings import Settings

    root, state = tmp_path / "components", tmp_path / "state"
    root.mkdir()
    state.mkdir()
    installed = install_with_evidence("plip", root, str(uuid4()))
    atomic_json(root / "installed.json", {"plip": installed})
    atomic_json(state / "deployment.json", {"root": str(root), "automatic": False})
    source = verified_file(tmp_path / "public", FILES["stat6_structure"])
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
        uploaded = client.post(
            "/api/assets?kind=structure&name=STAT6-9BIG.cif",
            content=source,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert uploaded.status_code == 201, uploaded.text
        asset = uploaded.json()
        reference = {
            "asset_id": asset["id"],
            "sha256": asset["sha256"],
            "record": 0,
            "conformer": 0,
        }
        response = client.post(
            "/api/jobs",
            headers={"Idempotency-Key": str(uuid4())},
            json={
                "operation": "interaction_profile",
                "name": "STAT6 / deposited AK-1690 interaction profile",
                "inputs": [{"role": "structure", "source": reference}],
                "scientific_inputs": [reference],
                "payload": {"kind": "plip", "ligand_chain": "A", "ligand_number": 701},
                "options": {"cpu": 1, "memory_mib": 2048},
            },
        )
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] in {"succeeded", "failed"}:
                break
            time.sleep(0.2)
        require_native_success(client, job, state)
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["program"] == "plip" and result["version"] == "3.0.1" and result["complete"]
        assert result["structure_artifact"] == "interaction-structure.cif"
        checks = verify_original_endpoints(result, source)
        retain_native_evidence(client, identifier, result, state, source, checks)
        assert client.get(f"/api/assets/{asset['id']}").content == source
        preview = client.get(
            f"/api/jobs/{identifier}/download", params={"name": result["structure_artifact"]}
        )
        assert preview.content == source  # Users receive the original chemical identifiers.
