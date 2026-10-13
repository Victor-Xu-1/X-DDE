"""Actual API, upload, install and owned-process boundaries under physical disk exhaustion."""

import asyncio
import errno
import hashlib
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from conftest import ProcessEngine, payload, wait_status
from test_jobs import submit

from opendde_workbench import disk_space
from opendde_workbench.asset_uploads import UploadInput, UploadStore
from opendde_workbench.assets import AssetStore
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.models import Prediction, Status
from opendde_workbench.requests import Properties
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


class _InertDirectoryEngine:
    def __init__(self):
        self.started = []
        self.stopped = []
        self.stop_failure = False

    async def start(self, job, directory):
        self.started.append(job.id)
        # A handled backend failure is sufficient to prove the next task was serviced.
        raise RuntimeError("Inert backend control; no process created")

    async def stop(self, identifier):
        self.stopped.append(identifier)
        if self.stop_failure:
            raise RuntimeError("Controlled cleanup uncertainty")


def _directory_fixture(settings, monkeypatch):
    store = Store(settings.state_dir / "jobs.sqlite3")
    jobs = [
        store.create(
            Properties(name="Inert lifecycle fixture", smiles=["C"]), str(uuid4()), 20, 500
        )
        for _ in range(2)
    ]
    engine = _InertDirectoryEngine()
    worker = Worker(store, engine, settings)
    monkeypatch.setattr("opendde_workbench.worker.prepare", lambda *args: None)

    async def stop_after_controls():
        if store.get(jobs[1].id).status == Status.FAILED:
            worker.stopping = True

    worker.before_claim = stop_after_controls
    return store, jobs, engine, worker


async def _run_directory_worker(worker):
    await worker.start()
    try:
        await asyncio.wait_for(worker.task, timeout=5)
    finally:
        await worker.close()


@pytest.mark.parametrize("failure", [errno.ENOSPC, errno.EACCES, errno.EIO, "collision"])
def test_directory_failure_finishes_task_and_services_next(settings, monkeypatch, failure):
    store, jobs, engine, worker = _directory_fixture(settings, monkeypatch)
    directory = settings.state_dir / "jobs" / jobs[0].id
    original = Path.mkdir
    if failure == "collision":
        directory.parent.mkdir()
        directory.write_bytes(b"Existing caller-owned data")
    else:

        def fail_owned(path, *args, **kwargs):
            if path == directory:
                raise OSError(failure, "Controlled directory failure")
            return original(path, *args, **kwargs)

        monkeypatch.setattr(Path, "mkdir", fail_owned)

    asyncio.run(_run_directory_worker(worker))
    first = store.get(jobs[0].id)
    assert first.status == Status.FAILED and first.finished_at
    assert first.request == jobs[0].request
    assert store.get(jobs[1].id).status == Status.FAILED
    assert engine.started == [jobs[1].id]
    assert engine.stopped == [job.id for job in jobs]
    assert worker.error is None and store.queue_halt() is None
    if failure == "collision":
        assert directory.read_bytes() == b"Existing caller-owned data"
        assert "FileExistsError" in first.error
    else:
        assert not directory.exists()
        assert type(OSError(failure, "")).__name__ in first.error


@pytest.mark.parametrize("log_failure", ["open", "write", "close"])
def test_preparation_error_survives_diagnostic_failure(settings, monkeypatch, log_failure, caplog):
    store, jobs, engine, worker = _directory_fixture(settings, monkeypatch)
    owned_log = settings.state_dir / "jobs" / jobs[0].id / "run.log"
    original = Path.open

    def prepare(job, *args):
        if job.id == jobs[0].id:
            raise ValueError("Original controlled preparation failure")

    class FailedWrite:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            if log_failure == "close":
                raise OSError(errno.EIO, "Controlled diagnostic close failure")
            return False

        def write(self, text):
            if log_failure == "close":
                return len(text)
            raise OSError(errno.ENOSPC, "Controlled diagnostic failure")

    def open_log(path, *args, **kwargs):
        if path == owned_log:
            if log_failure == "open":
                raise PermissionError(errno.EACCES, "Controlled diagnostic failure")
            return FailedWrite()
        return original(path, *args, **kwargs)

    monkeypatch.setattr("opendde_workbench.worker.prepare", prepare)
    monkeypatch.setattr(Path, "open", open_log)
    asyncio.run(_run_directory_worker(worker))
    assert store.get(jobs[0].id).status == Status.FAILED
    assert "ValueError" in store.get(jobs[0].id).error
    assert "Original controlled preparation failure" in caplog.text
    assert engine.started == [jobs[1].id]
    assert engine.stopped == [job.id for job in jobs]
    assert worker.error is None and store.queue_halt() is None


def test_cancel_and_unconfirmed_cleanup_preserve_halt_until_restart(settings, monkeypatch):
    store, jobs, engine, worker = _directory_fixture(settings, monkeypatch)
    directory = settings.state_dir / "jobs" / jobs[0].id
    original = Path.mkdir

    def fail_owned(path, *args, **kwargs):
        if path == directory:
            store.cancel(jobs[0].id)
            raise PermissionError(errno.EACCES, "Controlled directory failure after cancel")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", fail_owned)
    engine.stop_failure = True
    asyncio.run(_run_directory_worker(worker))
    assert store.get(jobs[0].id).status == Status.FAILED
    assert store.get(jobs[1].id).status == Status.QUEUED
    assert "Controlled cleanup uncertainty" in store.get(jobs[0].id).error
    assert worker.error and store.queue_halt()["job_id"] == jobs[0].id
    assert engine.started == [] and engine.stopped == [jobs[0].id]

    # The fault is removed. Startup uses the existing stop authority and clears its halt.
    monkeypatch.setattr(Path, "mkdir", original)
    engine.stop_failure = False
    reopened = Store(settings.state_dir / "jobs.sqlite3")
    recovered = Worker(reopened, engine, settings)
    recovered.stopping = True
    asyncio.run(_run_directory_worker(recovered))
    assert reopened.queue_halt() is None and recovered.error is None
    assert reopened.get(jobs[0].id).status == Status.FAILED
    assert reopened.get(jobs[1].id).status == Status.QUEUED
    assert engine.stopped == [jobs[0].id, jobs[0].id]
    assert engine.started == []


@pytest.mark.parametrize("dataset", [False, True], ids=["ordinary", "dataset"])
@pytest.mark.parametrize("action", ["cancel", "close", "cancel-and-close", "normal"])
def test_predispatch_intent_prevents_new_backend_start(settings, monkeypatch, dataset, action):
    _predispatch_intent_scenario(settings, monkeypatch, dataset, action)


@pytest.mark.parametrize("dataset", [False, True], ids=["ordinary", "dataset"])
def test_predispatch_cancel_cleanup_uncertainty_still_halts(settings, monkeypatch, dataset):
    _predispatch_intent_scenario(settings, monkeypatch, dataset, "cancel", fail_stop=True)


def _predispatch_intent_scenario(settings, monkeypatch, dataset, action, fail_stop=False):
    """Actual Worker.run/close and HTTP cancellation; inert dispatch, no science."""
    import threading

    import httpx2 as httpx

    from opendde_workbench.api import create_app
    from opendde_workbench.datasets.contract import DatasetTask

    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    if dataset:
        content = b"SMILES,ID\nCCO,ethanol\n"
        uploads = UploadStore(assets, 1024**2, 2 * 1024**2, 0)
        key = uuid4()
        uploads.create(UploadInput(name="fixture.csv", kind="library", size=len(content)), key)
        uploads.append(key, 0, content, hashlib.sha256(content).hexdigest())
        asset = uploads.finalize(key)
        ref = {"asset_id": asset.id, "sha256": asset.sha256}
        request = DatasetTask(
            operation="library_prepare",
            name="Controlled pre-dispatch dataset",
            inputs=[{"role": "data", "source": ref}],
            scientific_inputs=[ref],
            payload={"kind": "chemistry"},
        )
    else:
        request = Properties(name="Controlled pre-dispatch task", smiles=["CCO"])
    job = store.create(request, str(uuid4()), 10, 100)
    events = []

    class Process:
        returncode = None

        async def wait(self):
            return self.returncode

        def kill(self):
            self.returncode = -9

    class Engine:
        def __init__(self):
            self.started = []
            self.process = None

        async def readiness(self):
            return {"ready": True}

        async def start(self, value, directory):
            self.started.append(value.id)
            events.append("start")
            self.process = Process()
            self.process.stdout = asyncio.StreamReader()
            self.process.stdout.feed_eof()
            # Normal control deliberately exits nonzero, without scientific output.
            if action == "normal":
                self.process.returncode = 1
            return self.process

        async def stop(self, identifier):
            events.append("stop")
            if fail_stop:
                raise RuntimeError("Controlled cleanup uncertainty")
            if self.process:
                self.process.returncode = -15

    engine = Engine()
    worker = Worker(store, engine, settings, assets)
    # No app lifespan: only this owned Worker runs, never a deployment manager.
    app = create_app(settings, engine)
    entered, release = threading.Event(), threading.Event()
    require_space = disk_space.require_space

    def held_storage_check(*args):
        # Worker.run checks disk while queued; hold only execute's post-claim check.
        if store.get(job.id).status == Status.RUNNING and not entered.is_set():
            entered.set()
            assert release.wait(5), "Pre-dispatch check was not released"
        return require_space(*args)

    monkeypatch.setattr(disk_space, "require_space", held_storage_check)

    async def scenario():
        closing = None
        await worker.start()
        try:
            assert await asyncio.to_thread(entered.wait, 5)
            assert engine.started == []
            if "cancel" in action:
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="http://127.0.0.1:4320",
                ) as client:
                    session = await client.get("/api/session")
                    response = await client.post(
                        f"/api/jobs/{job.id}/cancel",
                        headers={"X-Workbench-CSRF": session.json()["csrf_token"]},
                    )
                assert response.status_code == 200
                assert response.json()["status"] == "cancelling"
                assert Store(store.path).get(job.id).status == Status.CANCELLING
                events.append("cancel-confirmed")
            if "close" in action:
                closing = asyncio.create_task(worker.close())
                await asyncio.sleep(0)
                assert worker.stopping and not closing.done()
                events.append("close-requested")
        finally:
            release.set()
            try:
                async with asyncio.timeout(8):
                    while store.get(job.id).status in {Status.RUNNING, Status.CANCELLING}:
                        await asyncio.sleep(0.01)
            finally:
                await asyncio.wait_for(closing or worker.close(), 8)

    asyncio.run(scenario())
    final = Store(store.path).get(job.id)
    assert final.request == request
    assert final.started_at is not None and final.finished_at is not None
    assert events[-1] == "stop"
    if fail_stop:
        assert final.status == Status.FAILED
        assert "Controlled cleanup uncertainty" in final.error
        assert worker.error and store.queue_halt()["job_id"] == job.id
    else:
        expected = (
            Status.FAILED
            if action == "normal"
            else Status.INTERRUPTED
            if "close" in action
            else Status.CANCELLED
        )
        assert final.status == expected
        assert worker.error is None and store.queue_halt() is None
    assert engine.started == ([job.id] if action == "normal" else [])
