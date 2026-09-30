"""Configuration and science share X-DDE ownership, but have independent contracts."""

import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from conftest import ProcessEngine, payload, wait_status
from test_jobs import submit

from opendde_workbench.backend_router import BackendRouter
from opendde_workbench.deployment.catalog import PACKAGES
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.deployment.provisioners import OPENDDE, provisioning_origin
from opendde_workbench.execution_environment import capture
from opendde_workbench.locations import atomic_json
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.store import ConflictError, Store


def test_reviewed_native_provisioning_uses_a_real_interpreter_and_result_protocol(tmp_path):
    fixture = tmp_path / "fixture/opendde_harness/cli"
    fixture.mkdir(parents=True)
    for path in [fixture.parent / "__init__.py", fixture / "__init__.py"]:
        path.write_text("")
    (fixture / "compute_code.py").write_text(
        "def prepare_runtime_code(target):\n"
        " target.mkdir(parents=True,exist_ok=True)\n"
        " (target/'verified-source.txt').write_text('native protocol fixture')\n"
        " return target\n"
    )
    installed = {"harness": {"python": sys.executable, "version": PACKAGES["harness"].version}}
    calls = []

    def execute(args, timeout=3600):
        calls.append(args)
        return subprocess.run(
            [str(arg) for arg in args],
            check=True,
            text=True,
            capture_output=True,
            timeout=timeout,
            env={**os.environ, "PYTHONPATH": str(fixture.parents[1])},
        ).stdout

    result = OPENDDE.prepare(
        "runtime", tmp_path / "components", tmp_path, installed, execute, lambda value: None
    )
    assert Path(result["code"]) == tmp_path / "components/code"
    assert (Path(result["code"]) / "verified-source.txt").is_file()
    assert calls[0][2] == "code"
    assert OPENDDE.status(installed)["lifecycle_owner"] == "X-DDE"
    assert "pause" not in OPENDDE.status(installed)["actions"]
    with pytest.raises(ValueError, match="does not support"):
        OPENDDE.prepare("diffsbdd", tmp_path, tmp_path, installed, execute, print)
    assert provisioning_origin("diffsbdd", "operation")["engine"] == "x-dde"
    assert (
        provisioning_origin("runtime", "operation")["implementation"] == "OpenDDE Harness installer"
    )


def test_platform_and_prepared_science_do_not_depend_on_provisioner_readiness(
    client_factory, settings
):
    router = BackendRouter(settings)
    router.opendde = ProcessEngine()
    with client_factory(router) as client:
        health = client.get("/api/health").json()
        assert health["platform"]["ready"]
        assert not health["provisioners"]["opendde"]["ready"]
        assert health["environments"]["opendde"]["ready"]
        assert health["environments"] == health["engines"]
        response = submit(client)
        assert response.status_code == 201
        job = wait_status(client, response.json()["id"], {"succeeded"})
        record = client.get(f"/api/jobs/{job['id']}/environment").json()
        assert record["specification"]["scientific_software"] == "opendde"
        assert record["verification"] == "installation_metadata_only"
        assert "not asserted" in record["origin_note"]
        assert client.get(f"/api/jobs/{uuid4()}/environment").status_code == 404


def test_configuration_failure_is_a_deployment_operation_not_a_scientific_job(
    tmp_path, monkeypatch
):
    state = tmp_path / "state"
    manager = DeploymentManager(state)
    root = Path(manager.configure(str(tmp_path / "components"), False)["config"]["root"])
    atomic_json(
        root / "installed.json",
        {
            "harness": {
                "python": sys.executable,
                "version": PACKAGES["harness"].version,
            }
        },
    )
    science = Store(state / "jobs.sqlite3")
    job = science.create(TASK_ADAPTER.validate_python(payload()), str(uuid4()), 20, 500)
    operation = manager.enqueue("runtime", "install")[-1]

    def fail(*args):
        raise RuntimeError("controlled environment configuration failure")

    monkeypatch.setattr("opendde_workbench.deployment.installers.OPENDDE.prepare", fail)
    manager.tick()
    assert manager.store.get(operation)["state"] == "failed"
    assert "configuration failure" in manager.store.get(operation)["error"]
    assert science.get(job.id).status == "queued"
    assert len(science.list_jobs()) == 1


def test_environment_version_binding_is_immutable_and_survives_store_restart(settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    job = store.create(TASK_ADAPTER.validate_python(payload()), str(uuid4()), 20, 500)
    original = capture(settings, "opendde")
    store.bind_environment(job.id, original)
    store.bind_environment(job.id, original)
    changed = capture(replace(settings, model_dir=settings.model_dir / "new"), "opendde")
    with pytest.raises(ConflictError, match="immutable"):
        store.bind_environment(job.id, changed)
    assert Store(store.path).environment(job.id) == original
    with store.connect() as db:
        data = original.model_dump(mode="json")
        data["specification"]["runtime"]["models"] = "/tampered"
        db.execute(
            "UPDATE job_environments SET record=? WHERE job_id=?", (json.dumps(data), job.id)
        )
    with pytest.raises(ValueError, match="integrity"):
        store.environment(job.id)
