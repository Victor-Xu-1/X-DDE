"""Real deposited phosphorylated STAT6 dimer through the queue, PLIP 3 and downloads."""

import hashlib
import io
import json
import math
import os
import time
from pathlib import Path
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_NATIVE_INTERFACE") != "1",
    reason="Explicit scoped native protein-interface acceptance only",
)


def verify_endpoints(result, source):
    from Bio.PDB import MMCIFParser

    model = MMCIFParser(QUIET=True).get_structure("STAT6", io.StringIO(source.decode()))[0]
    residues = {
        (chain.id, residue.id[1], residue.resname, residue.id[2].strip()): residue
        for chain in model
        for residue in chain
    }
    checked = 0
    for row in result["interactions"]:
        assert math.isclose(
            math.dist(row["protein_position"], row["ligand_position"]),
            row["distance"],
            abs_tol=1e-9,
        )
        target = (row["chain"], row["number"], row["residue"], row["insertion_code"])
        other = row["partner"]
        partner = (other["chain"], other["number"], other["residue"], other["insertion_code"])
        assert target in residues and partner in residues
        if row["kind"] in {"hydrogen_bond", "hydrophobic", "halogen_bond", "water_bridge"}:
            for identity, point in (
                (target, row["protein_position"]),
                (partner, row["ligand_position"]),
            ):
                assert min(math.dist(atom.coord, point) for atom in residues[identity]) < 0.002
            checked += 1
    assert checked > 0
    assert any(
        r["residue"] == "PTR" or r["partner"]["residue"] == "PTR" for r in result["interactions"]
    )
    return checked


def test_stat6_phosphorylated_dimer_keeps_all_native_contacts_and_source_download(tmp_path):
    from fastapi.testclient import TestClient
    from scientific_install_evidence import install_with_evidence

    from opendde_workbench.api import create_app
    from opendde_workbench.locations import atomic_json
    from opendde_workbench.settings import Settings

    root, state = tmp_path / "components", tmp_path / "state"
    root.mkdir()
    state.mkdir()
    installed = install_with_evidence("plip", root, str(uuid4()))
    atomic_json(root / "installed.json", {"plip": installed})
    atomic_json(state / "deployment.json", {"root": str(root), "automatic": False})
    source = (
        Path(__file__).parents[1] / "src/opendde_workbench/examples/stat6/inputs/4Y5U.cif"
    ).read_bytes()
    settings = Settings(
        state_dir=state,
        image_file=tmp_path / "unused-image",
        code_file=tmp_path / "unused-code",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
    )
    evidence = Path("server_tests/evidence/protein-interface")
    evidence.mkdir(parents=True, exist_ok=True)
    with TestClient(create_app(settings), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        response = client.post(
            "/api/assets?kind=structure&name=STAT6-4Y5U.cif",
            content=source,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201, response.text
        asset = response.json()
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
                "operation": "protein_interface",
                "name": "STAT6 phosphorylated dimer A/B",
                "inputs": [{"role": "structure", "source": reference}],
                "scientific_inputs": [reference],
                "payload": {
                    "kind": "plip",
                    "scope": "protein_interface",
                    "target_chains": ["A"],
                    "binder_chains": ["B"],
                    "candidate_names": ["STAT6 4Y5U A/B"],
                },
                "options": {"cpu": 1, "memory_mib": 2048},
            },
        )
        assert response.status_code == 201, response.text
        identifier, job = response.json()["id"], response.json()
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] in {"succeeded", "failed", "interrupted"}:
                break
            time.sleep(0.25)
        (evidence / "job.json").write_text(json.dumps(job, indent=2))
        if job["status"] != "succeeded":
            logs = client.get(f"/api/jobs/{identifier}/logs").json()["text"]
            (evidence / "failure.log").write_text(logs)
            pytest.fail(logs[-16000:], pytrace=False)
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        (evidence / "result.json").write_text(json.dumps(result, indent=2))
        assert result["program"] == "plip" and result["version"] == "3.0.1"
        interface = result["protein_interfaces"][0]
        checked = verify_endpoints(interface, source)
        assert interface["polymer_residues"] == 883
        for name, expected in result["artifact_sha256"].items():
            data = client.get(f"/api/jobs/{identifier}/download", params={"name": name}).content
            assert hashlib.sha256(data).hexdigest() == expected
            (evidence / name).write_bytes(data)
        assert (evidence / interface["structure_artifact"]).read_bytes() == source
        (evidence / "independent-endpoints.json").write_text(
            json.dumps(
                {
                    "verified_atomic_contacts": checked,
                    "source_sha256": hashlib.sha256(source).hexdigest(),
                }
            )
        )
