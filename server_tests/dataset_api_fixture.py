"""Real isolated environments and API/Worker receipts for dataset acceptance only."""

import hashlib
import json
import time
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from scientific_install_evidence import install_with_evidence

from opendde_workbench.api import create_app
from opendde_workbench.locations import atomic_json
from opendde_workbench.settings import Settings


class Campaign:
    def __init__(self, root, programs):
        self.root = root
        components = root / "components"
        components.mkdir(parents=True)
        installed = {
            program: install_with_evidence(program, components, str(uuid4()))
            for program in programs
        }
        if "drugclip" in programs:
            installed["drugclip-models"] = install_with_evidence(
                "drugclip-models", components, str(uuid4())
            )
        atomic_json(components / "installed.json", installed)
        self.settings = Settings(
            state_dir=root / "state",
            image_file=root / "unused/image",
            code_file=root / "unused/code",
            model_dir=root / "models",
            cache_dir=root / "cache",
            minimum_free_bytes=0,
            chemistry_image=installed.get("chemistry", {}).get("image"),
            gnina_image=installed.get("gnina", {}).get("image"),
        )
        self.settings.state_dir.mkdir(parents=True)
        atomic_json(
            self.settings.state_dir / "deployment.json",
            {"root": str(components), "automatic": False},
        )
        self.client = TestClient(create_app(self.settings), base_url="http://127.0.0.1:4320")
        self.jobs = []

    def __enter__(self):
        self.client.__enter__()
        self.client.headers["X-Workbench-CSRF"] = self.client.get("/api/session").json()[
            "csrf_token"
        ]
        return self

    def __exit__(self, *args):
        self.client.__exit__(*args)

    def material(self, raw, name, kind, role, label=""):
        if kind in {"library", "counts", "reads"}:
            key = str(uuid4())
            response = self.client.post(
                "/api/assets/uploads",
                json={
                    "kind": kind,
                    "name": name,
                    "size": len(raw),
                },
                headers={"Idempotency-Key": key},
            )
            assert response.status_code == 201, response.text
            for offset in range(0, len(raw), 4 * 1024**2):
                chunk = raw[offset : offset + 4 * 1024**2]
                response = self.client.put(
                    f"/api/assets/uploads/{key}?offset={offset}",
                    content=chunk,
                    headers={
                        "X-Chunk-SHA256": hashlib.sha256(chunk).hexdigest(),
                        "Content-Type": "application/octet-stream",
                    },
                )
                assert response.status_code == 200, response.text
            response = self.client.post(f"/api/assets/uploads/{key}/complete")
        else:
            response = self.client.post(
                "/api/assets",
                params={"kind": kind, "name": name},
                content=raw,
                headers={"Content-Type": "application/octet-stream"},
            )
        assert response.status_code in {200, 201}, response.text
        asset = response.json()
        return {
            "role": role,
            "source": {"asset_id": asset["id"], "sha256": asset["sha256"]},
            "label": label,
        }

    def task(self, operation, payload, inputs=(), sources=(), deadline=1200):
        response = self.client.post(
            "/api/jobs",
            headers={"Idempotency-Key": str(uuid4())},
            json={
                "operation": operation,
                "name": "Public native " + operation,
                "inputs": list(inputs),
                "sources": list(sources),
                "scientific_inputs": [item["source"] for item in inputs],
                "payload": payload,
                "options": {"cpu": 2, "memory_mib": 8192},
            },
        )
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        until = time.monotonic() + deadline
        while time.monotonic() < until:
            job = self.client.get(f"/api/jobs/{identifier}").json()
            if job["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.3)
        assert job["status"] == "succeeded", self.client.get(f"/api/jobs/{identifier}/logs").json()
        response = self.client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        output = self.settings.state_dir / "jobs" / identifier / "output"
        assert json.loads((output.parent / "native-exit.json").read_text())["ExitCode"] == 0
        for artifact in result["artifacts"]:
            download = self.client.get(
                f"/api/jobs/{identifier}/download", params={"name": artifact["name"]}
            )
            assert download.status_code == 200, download.text
            assert hashlib.sha256(download.content).hexdigest() == artifact["sha256"]
        environment = self.client.get(f"/api/jobs/{identifier}/environment").json()
        self.jobs.append({"job": job, "result": result, "environment": environment})
        return (
            {
                "job_id": identifier,
                "role": result["data_kind"],
                "report_sha256": hashlib.sha256((output / "result.json").read_bytes()).hexdigest(),
            },
            result,
            output,
        )

    def receipt(self, name):
        directory = Path("server_tests/evidence/datasets") / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "acceptance.json").write_text(json.dumps(self.jobs, indent=2))
        # Retain the exact state for a reviewed fixed example export, never regenerate scores.
        import shutil

        shutil.copytree(self.settings.state_dir, directory / "state", dirs_exist_ok=True)

    def interactions(self, source_job, complex_name, chain, residue):
        imported = self.client.post(
            f"/api/jobs/{source_job}/assets", params={"kind": "structure", "name": complex_name}
        )
        assert imported.status_code == 201, imported.text
        asset = imported.json()
        reference = {"asset_id": asset["id"], "sha256": asset["sha256"]}
        response = self.client.post(
            "/api/jobs",
            headers={"Idempotency-Key": str(uuid4())},
            json={
                "operation": "interaction_profile",
                "name": "Actual PLIP docking follow-up",
                "inputs": [{"role": "structure", "source": reference}],
                "scientific_inputs": [reference],
                "payload": {"kind": "plip", "ligand_chain": chain, "ligand_number": residue},
                "options": {"cpu": 2, "memory_mib": 4096},
            },
        )
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        until = time.monotonic() + 300
        while time.monotonic() < until:
            job = self.client.get(f"/api/jobs/{identifier}").json()
            if job["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.3)
        assert job["status"] == "succeeded", self.client.get(f"/api/jobs/{identifier}/logs").json()
        response = self.client.get(f"/api/jobs/{identifier}/result")
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["interactions"] and result["structure_artifact"]
        for name, digest in result["artifact_sha256"].items():
            download = self.client.get(f"/api/jobs/{identifier}/download", params={"name": name})
            assert (
                download.status_code == 200
                and hashlib.sha256(download.content).hexdigest() == digest
            )
        (self.root / "native-interaction-followup.json").write_text(
            json.dumps({"job": job, "result": result}, indent=2)
        )
