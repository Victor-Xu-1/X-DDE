"""Controlled real processes exercise supervision, not scientific inference."""

import asyncio
import sys
import time
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from opendde_workbench.api import create_app
from opendde_workbench.settings import Settings


class ProcessEngine:
    def __init__(self, script=None, ready=True):
        self.script = script or (
            "from pathlib import Path; import time; print('worker-started', flush=True); "
            "time.sleep(0.2); Path('output').mkdir(exist_ok=True); "
            "Path('output/result.cif').write_text('controlled-process-output'); print('finished')"
        )
        self.ready = ready
        self.processes = {}
        self.started = []
        self.stopped = []

    async def readiness(self):
        return {
            "ready": self.ready,
            "gpu": "controlled subprocess",
            "reason": None if self.ready else "Engine unavailable.",
        }

    async def start(self, job, directory):
        self.started.append(job.id)
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            "-c",
            self.script,
            cwd=directory,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self.processes[job.id] = process
        return process

    async def stop(self, job_id):
        self.stopped.append(job_id)
        process = self.processes.get(job_id)
        if process and process.returncode is None:
            process.kill()
            await process.wait()


@pytest.fixture
def settings(tmp_path):
    return Settings(
        state_dir=tmp_path / "state",
        image_file=tmp_path / "image.txt",
        code_file=tmp_path / "code.txt",
        model_dir=tmp_path / "models",
        cache_dir=tmp_path / "cache",
        minimum_free_bytes=0,
    )


@pytest.fixture
def client_factory(settings):
    from contextlib import contextmanager

    @contextmanager
    def factory(engine=None, **overrides):
        app = create_app(replace(settings, **overrides), engine or ProcessEngine())
        with TestClient(app, base_url="http://127.0.0.1:4320") as client:
            client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
            yield client

    return factory


def wait_status(client, job_id, statuses, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in statuses:
            return job
        time.sleep(0.04)
    raise AssertionError(f"Task did not reach {statuses}: {job}")


def payload():
    return {"name": "controlled test", "components": [{"kind": "ligand", "value": "CCO"}]}
