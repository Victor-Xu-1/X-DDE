"""Actual API, upload, install and owned-process boundaries under physical disk exhaustion."""

import asyncio
import hashlib
import time
from dataclasses import replace
from uuid import uuid4

import pytest
from conftest import ProcessEngine, payload, wait_status
from test_jobs import submit

from opendde_workbench import disk_space
from opendde_workbench.asset_uploads import UploadInput, UploadStore
from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.models import Prediction, Status
from opendde_workbench.store import Store
from opendde_workbench.worker import Worker
from opendde_workbench.wsl_storage import StorageUnavailable


def test_api_does_not_claim_a_task_when_physical_storage_is_full(client_factory, monkeypatch):
    monkeypatch.setattr("opendde_workbench.api.available_bytes", lambda _: 0)
    engine = ProcessEngine()
    with client_factory(engine, minimum_free_bytes=1) as client:
        response = submit(client)
        assert response.status_code == 507
        assert not client.get("/api/jobs").json()
    assert engine.started == []


def test_unverified_capacity_is_unavailable_not_a_fake_zero(client_factory, monkeypatch):
    def unavailable(_):
        raise StorageUnavailable("Cannot verify free space on the host disk.")

    monkeypatch.setattr("opendde_workbench.api.available_bytes", unavailable)
    with client_factory(minimum_free_bytes=1) as client:
        assert submit(client).status_code == 503
        health = client.get("/api/health").json()
        assert health["free_disk_gib"] is None and health["storage_error"]


def test_small_upload_is_rejected_before_file_publication(client_factory, monkeypatch):
    monkeypatch.setattr(disk_space, "available_bytes", lambda _: 0)
    with client_factory(minimum_free_bytes=1) as client:
        response = client.post(
            "/api/assets", params={"name": "structure.pdb", "kind": "structure"}, content=b"END\n"
        )
        assert response.status_code == 507
        assert client.get("/api/assets").json() == []


def test_large_upload_keeps_confirmed_bytes_when_capacity_disappears(tmp_path, monkeypatch):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    uploads = UploadStore(assets, 1024**2, 2 * 1024**2, 1)
    transfer = uploads.create(UploadInput(name="library.csv", kind="library", size=8), uuid4())
    data = b"ID,X"
    uploads.append(transfer["id"], 0, data, hashlib.sha256(data).hexdigest())
    monkeypatch.setattr("opendde_workbench.asset_uploads.available_bytes", lambda _: 0)
    with pytest.raises(ValueError, match="space"):
        uploads.append(transfer["id"], 4, b"\nA,1", hashlib.sha256(b"\nA,1").hexdigest())
    assert uploads.get(transfer["id"])["offset"] == 4
    assert uploads.path(uploads.get(transfer["id"])).read_bytes() == data
    assert assets.list() == []


def test_install_failure_does_not_replace_the_existing_environment(tmp_path, monkeypatch):
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    operation = manager.enqueue("ketcher", "install")[0]
    monkeypatch.setattr(disk_space, "available_bytes", lambda _: 0)
    called = []
    monkeypatch.setattr(
        "opendde_workbench.deployment.manager.install", lambda *a, **k: called.append(True)
    )
    manager.tick()
    assert manager.store.get(operation)["state"] == "failed"
    assert "space" in manager.store.get(operation)["error"]
    assert not called and manager.store.installed() == {}


def test_live_process_is_stopped_through_its_existing_owner_when_space_is_low(
    client_factory, monkeypatch
):
    engine = ProcessEngine(script="import time; print('running', flush=True); time.sleep(60)")
    with client_factory(engine, minimum_free_bytes=1) as client:
        created = submit(client)
        assert created.status_code == 201
        identifier = created.json()["id"]
        wait_status(client, identifier, {"running"})
        deadline = time.monotonic() + 8
        while identifier not in engine.processes and time.monotonic() < deadline:
            time.sleep(0.02)
        assert identifier in engine.processes
        assert engine.processes[identifier].returncode is None
        monkeypatch.setattr(disk_space, "available_bytes", lambda _: 0)
        ended = wait_status(client, identifier, {"failed"})
        assert "free disk space" in ended["error"]
        assert engine.started == [identifier]
        assert set(engine.stopped) == {identifier}


def test_pending_research_stays_queued_until_capacity_is_restored(settings, monkeypatch):
    configured = replace(settings, minimum_free_bytes=1)
    store = Store(configured.state_dir / "jobs.sqlite3")
    job = store.create(Prediction.model_validate(payload()), str(uuid4()), 20, 500)
    engine = ProcessEngine()
    worker = Worker(store, engine, configured)
    monkeypatch.setattr(disk_space, "available_bytes", lambda _: 0)

    async def scenario():
        await worker.start()
        try:
            deadline = time.monotonic() + 8
            while not worker.waiting_reason and time.monotonic() < deadline:
                await asyncio.sleep(0.02)
            assert "disk space" in worker.waiting_reason
            assert store.get(job.id).status == Status.QUEUED
            assert engine.started == []
        finally:
            await worker.close()

    asyncio.run(scenario())
