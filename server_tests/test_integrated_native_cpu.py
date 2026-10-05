"""Real public structures through isolated programs and the existing API/task authority."""

import io
import json
import os
import time
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_INTEGRATED_NATIVE_CPU") != "1",
    reason="Native scientific acceptance runs only on CI or the intended server",
)


def test_public_brd4_native_program_queue_and_downloads(tmp_path):
    from Bio.PDB import PDBIO, PDBParser, Select
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.deployment.installers import install
    from opendde_workbench.examples.catalogue import FILES
    from opendde_workbench.examples.files import verified_file
    from opendde_workbench.locations import atomic_json
    from opendde_workbench.settings import Settings

    program = os.environ["WB_SCIENTIFIC_PROGRAM"]
    assert program in {"plip", "apbs", "openmm"}
    root, state = tmp_path / "components", tmp_path / "state"
    root.mkdir()
    state.mkdir()
    installed = install(program, root, {}, str(uuid4()), print, lambda: None)
    atomic_json(root / "installed.json", {program: installed})
    atomic_json(state / "deployment.json", {"root": str(root), "automatic": False})
    original = verified_file(tmp_path / "public", FILES["brd4"])
    structure = PDBParser(QUIET=True).get_structure("BRD4", io.StringIO(original.decode()))
    ligand = next(r for r in structure.get_residues() if r.resname == "JQ1")
    if program == "plip":
        source = original
        operation = "interaction_profile"
        payload = {"kind": program, "ligand_chain": ligand.parent.id, "ligand_number": ligand.id[1]}
    else:

        class Protein(Select):
            def accept_residue(self, residue):
                return residue.id[0] == " "

        # Explicitly prepare a separate test input; the public complex bytes are unchanged.
        writer, stream = PDBIO(), io.StringIO()
        writer.set_structure(structure)
        writer.save(stream, Protein())
        source = stream.getvalue().encode()
        operation = "electrostatics" if program == "apbs" else "structure_refine"
        payload = {"kind": program, **({"grid": 65} if program == "apbs" else {"iterations": 100})}
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
            "/api/assets?kind=structure&name=BRD4-native.pdb",
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
                "operation": operation,
                "name": "BRD4 public native acceptance",
                "inputs": [{"role": "structure", "source": reference}],
                "scientific_inputs": [reference],
                "payload": payload,
                "options": {"cpu": 2, "memory_mib": 3072},
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
        assert job["status"] == "succeeded", client.get(f"/api/jobs/{identifier}/logs").json()
        response = client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["program"] == program and result["complete"]
        if program == "plip":
            assert result["interactions"]
            assert any(row["kind"] == "hydrogen_bond" for row in result["interactions"])
        elif program == "apbs":
            assert result["potential_unit"] == "kBT/e"
        else:
            metrics = result["candidates"][0]["metrics"]
            assert metrics[1]["value"] <= metrics[0]["value"]
        for name in result["artifact_sha256"]:
            assert (
                client.get(f"/api/jobs/{identifier}/download", params={"name": name}).status_code
                == 200
            )
        assert client.get(f"/api/assets/{asset['id']}").content == source
        native_exit = state / "jobs" / identifier / "native-exit.json"
        assert json.loads(native_exit.read_text())["ExitCode"] == 0
