"""Real public structures through isolated programs and the existing API/task authority."""

import io
import json
import os
import time
from uuid import uuid4

import pytest
from scientific_install_evidence import install_with_evidence

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_INTEGRATED_NATIVE_CPU") != "1",
    reason="Native scientific acceptance runs only on CI or the intended server",
)


@pytest.mark.parametrize("include_bound_ligand", [False, True])
def test_public_brd4_native_program_queue_and_downloads(tmp_path, include_bound_ligand):
    from Bio.PDB import PDBIO, PDBParser, Select
    from fastapi.testclient import TestClient

    from opendde_workbench.api import create_app
    from opendde_workbench.examples.catalogue import FILES
    from opendde_workbench.examples.files import verified_file
    from opendde_workbench.locations import atomic_json
    from opendde_workbench.settings import Settings

    program = os.environ["WB_SCIENTIFIC_PROGRAM"]
    assert program in {"plip", "apbs", "openmm"}
    if include_bound_ligand and program != "openmm":
        pytest.skip("Only the OpenMM adapter has an optional bound-ligand refinement input")
    root, state = tmp_path / "components", tmp_path / "state"
    root.mkdir()
    state.mkdir()
    installed = install_with_evidence(program, root, str(uuid4()))
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
        inputs = [{"role": "structure", "source": reference}]
        if include_bound_ligand:
            bound = verified_file(tmp_path / "public", FILES["jq1"])
            uploaded = client.post(
                "/api/assets?kind=ligand&name=BRD4-bound-JQ1.sdf",
                content=bound,
                headers={"Content-Type": "application/octet-stream"},
            )
            assert uploaded.status_code == 201, uploaded.text
            item = uploaded.json()
            inputs.append(
                {
                    "role": "ligand",
                    "source": {
                        "asset_id": item["id"],
                        "sha256": item["sha256"],
                        "record": 0,
                        "conformer": 0,
                    },
                }
            )
        response = client.post(
            "/api/jobs",
            headers={"Idempotency-Key": str(uuid4())},
            json={
                "operation": operation,
                "name": "BRD4 public native acceptance",
                "inputs": inputs,
                "scientific_inputs": [item["source"] for item in inputs],
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
            if include_bound_ligand:
                assert len(result["candidates"]) == 2
                assert result["candidates"][1]["artifact"] == "refined-ligand.sdf"
                assert client.get(f"/api/assets/{item['id']}").content == bound
        for name in result["artifact_sha256"]:
            assert (
                client.get(f"/api/jobs/{identifier}/download", params={"name": name}).status_code
                == 200
            )
        assert client.get(f"/api/assets/{asset['id']}").content == source
        native_exit = state / "jobs" / identifier / "native-exit.json"
        assert json.loads(native_exit.read_text())["ExitCode"] == 0
