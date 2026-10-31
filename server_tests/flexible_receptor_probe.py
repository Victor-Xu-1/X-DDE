"""One pinned upstream native sidechain case and exact downstream paired reuse."""

import hashlib
import json
import shutil
import time
from dataclasses import replace
from uuid import uuid4

from fastapi.testclient import TestClient


def inspect_refinement(settings, receptor_raw, ligand_reference, evidence):
    from opendde_workbench.api import create_app

    # The upstream fixture contains explicit H. Prepare its heavy-atom profile without
    # moving any heavy atom; preserve the pinned original separately as evidence.
    heavy = b"".join(
        line
        for line in receptor_raw.splitlines(keepends=True)
        if not (line[:6] in (b"ATOM  ", b"HETATM") and line[76:78].strip() in (b"H", b"D", b"T"))
    )
    assert b"CONECT" not in receptor_raw  # No dangling hydrogen bond declarations.
    root = evidence / "flexible-receptor"
    root.mkdir(exist_ok=True)
    (root / "upstream-184l-receptor.pdb").write_bytes(receptor_raw)

    def wait(client, identifier):
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            job = client.get("/api/jobs/" + identifier).json()
            if job["status"] in {"succeeded", "failed", "cancelled", "interrupted"}:
                assert job["status"] == "succeeded", job
                return client.get("/api/jobs/" + identifier + "/result").json()
            time.sleep(0.2)
        raise AssertionError("Bounded native sidechain case did not reach terminal state.")

    with TestClient(create_app(replace(settings)), base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        upload = client.post(
            "/api/assets?kind=structure&name=184l-heavy-receptor.pdb",
            content=heavy,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert upload.status_code == 201, upload.text
        source = {"asset_id": upload.json()["id"], "sha256": upload.json()["sha256"]}
        request = {
            "operation": "docking",
            "name": "Native selected sidechain minimization",
            "mode": "minimize",
            "receptor": source,
            "ligand": ligand_reference,
            "pose_frame": source,
            "pose_coordinate_basis": "user_confirmed",
            "options": {
                "cpu": 1,
                "memory_mib": 4096,
                "time_limit_seconds": 180,
                "cnn_scoring": "none",
                "minimize_iters": 200,
                "seed": 2026,
            },
            # Original upstream flexible-residue fixture: VAL111, LEU118/133, PHE153.
            "flexible_receptor": {
                "residues": [{"chain": "A", "number": number} for number in (111, 118, 133, 153)]
            },
        }
        submitted = client.post(
            "/api/jobs", json=request, headers={"Idempotency-Key": str(uuid4())}
        )
        assert submitted.status_code == 201, submitted.text
        identifier = submitted.json()["id"]
        result = wait(client, identifier)
        receipt = result["receptor_refinement"]
        assert receipt["original_receptor_sha256"] == hashlib.sha256(heavy).hexdigest()
        assert receipt["moved_sidechain_atoms"] > 0
        assert receipt["native_backbone_max_displacement_angstrom"] <= 0.002
        assert receipt["local_handedness_preserved"] is True
        assert receipt["convergence"] == "not_reported"
        assert result["poses"][0]["valid"]
        output = settings.state_dir / "jobs" / identifier / "output"
        for name in (
            "input-receptor.pdb",
            "receptor.pdb",
            "native-flex-receptor.pdb",
            "poses.sdf",
            "pose-001.sdf",
            "native.log",
            "result.json",
        ):
            shutil.copyfile(output / name, root / name)
        indexed = client.post("/api/jobs/" + identifier + "/index-assets", json={})
        assert indexed.status_code == 200 and indexed.json()["state"] == "complete", indexed.text
        versions = client.get(
            "/api/research/objects", params={"source_job": identifier, "limit": 200}
        ).json()
        assert not (
            {"input-receptor.pdb", "native-flex-receptor.pdb", "poses.sdf"}
            & {v["label"] for v in versions}
        )
        receptor = next(v["reference"] for v in versions if v["label"] == "receptor.pdb")
        ligand = next(v["reference"] for v in versions if v["label"] == "pose-001.sdf")
        assert receptor["sha256"] == receipt["receptor_sha256"]
        assert receptor["sha256"] != source["sha256"]
        followup = {
            "operation": "docking",
            "name": "Rescore the exact refined pair",
            "mode": "score",
            "receptor": receptor,
            "ligand": ligand,
            "pose_frame": receptor,
            "pose_coordinate_basis": "user_confirmed",
            "options": {
                "cpu": 1,
                "memory_mib": 2048,
                "time_limit_seconds": 60,
                "cnn_scoring": "none",
            },
        }
        submitted = client.post(
            "/api/jobs", json=followup, headers={"Idempotency-Key": str(uuid4())}
        )
        assert submitted.status_code == 201, submitted.text
        followup_result = wait(client, submitted.json()["id"])
        assert followup_result["receptor"] == receptor and followup_result["ligand"] == ligand
        assert "receptor_refinement" not in followup_result
        # Compare file identities and contract execution, not energies across changed protocols.
        (root / "native-paired-reuse.json").write_text(
            json.dumps(
                {
                    "request": request,
                    "result": result,
                    "versions": versions,
                    "followup_request": followup,
                    "followup_result": followup_result,
                    "scientific_acceptance": "native_protocol_only_not_STAT6_prediction_accuracy",
                },
                indent=2,
            )
        )
