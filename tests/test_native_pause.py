"""Native pause ownership and restart retention, without a scientific program or GPU."""

import asyncio
from uuid import uuid4

import pytest

from opendde_workbench.models import Status
from opendde_workbench.native_pause import owned_pause
from opendde_workbench.requests import Properties
from opendde_workbench.store import Store
from opendde_workbench.worker import Worker


def snapshot(directory, identifier):
    return {
        "name": "/xdde-openmm-" + identifier,
        "paused": True,
        "running": True,
        "program": "openmm",
        "mounts": [
            {
                "Destination": "/platform",
                "Source": str(directory / "adapter"),
                "RW": False,
                "Type": "bind",
            },
            {
                "Destination": "/output",
                "Source": str(directory / "output"),
                "RW": True,
                "Type": "bind",
            },
        ],
    }


def test_only_actual_owned_pauses_qualify(tmp_path):
    identifier = str(uuid4())
    value = snapshot(tmp_path, identifier)
    assert owned_pause(value, "openmm", identifier, tmp_path)
    assert not owned_pause({**value, "paused": False}, "openmm", identifier, tmp_path)
    with pytest.raises(ValueError, match="task identity"):
        owned_pause({**value, "name": "/another-task"}, "openmm", identifier, tmp_path)
    with pytest.raises(ValueError, match="workspace"):
        owned_pause(value, "openmm", identifier, tmp_path / "other")
    with pytest.raises(ValueError, match="program identity"):
        owned_pause({**value, "program": "other"}, "openmm", identifier, tmp_path)


def test_restart_retains_pause_request_start_time_and_files_without_stopping_native_task(settings):
    settings.state_dir.mkdir()
    store = Store(settings.state_dir / "jobs.sqlite3")
    request = Properties(name="Controlled lifecycle fixture", smiles=["c1ccccc1"])
    job = store.create(request, str(uuid4()), 20, 500)
    running = store.claim(job.id)
    directory = settings.state_dir / "jobs" / job.id / "output"
    directory.mkdir(parents=True)
    checkpoint = directory / "checkpoint.chk"
    checkpoint.write_bytes(b"Controlled lifecycle bytes, not a scientific checkpoint")

    class PausedEngine:
        stopped = []

        async def retained_pause(self, value):
            return value.id == job.id

        async def stop(self, identifier):
            self.stopped.append(identifier)

    engine = PausedEngine()

    async def restart():
        worker = Worker(store, engine, settings)
        await worker.start()
        await worker.close()

    asyncio.run(restart())
    preserved = store.get(job.id)
    assert preserved.status == Status.PAUSED and preserved.finished_at is None
    assert preserved.request == request and preserved.started_at == running.started_at
    assert checkpoint.read_bytes() == b"Controlled lifecycle bytes, not a scientific checkpoint"
    assert not engine.stopped and store.unfinished() == []
    next_job = store.create(request, str(uuid4()), 20, 500)
    assert store.claim().id == next_job.id
