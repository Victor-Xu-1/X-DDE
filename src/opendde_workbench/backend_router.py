"""One trusted routing authority for start, cancellation and restart recovery.

Capabilities describe scientific operations. Engines choose the scientific implementation.
Execution backends own process/container lifecycle. The existing Store remains task authority.
"""

import asyncio
import json
import os
from pathlib import Path

from . import harness_process, local_process
from .diffsbdd.runtime import configuration
from .diffsbdd.runtime import readiness as diff_readiness
from .engine import DockerEngine
from .store import Store


class BackendRouter:
    def __init__(self, settings):
        self.settings = settings
        self.store = Store(settings.state_dir / "jobs.sqlite3")
        self.opendde = DockerEngine(settings)

    async def start(self, job, directory):
        if job.request.operation == "harness":
            return await harness_process.start(self.settings, directory)
        if job.request.operation == "diffsbdd":
            python, source, root = configuration(self.settings)
            # Scientific software never inherits model-provider or compute-service secrets.
            env = {
                key: value
                for key, value in os.environ.items()
                if key in {"PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "CUDA_VISIBLE_DEVICES"}
            }
            env.update(
                XDDE_DIFFSBDD_SOURCE=str(source),
                XDDE_DIFFSBDD_HOME=str(root),
                XDDE_DIFFSBDD_MANIFEST_SHA256=self.settings.diffsbdd_manifest_sha256,
                PYTHONUNBUFFERED="1",
                PYTHONDONTWRITEBYTECODE="1",
                WANDB_MODE="disabled",
                OMP_NUM_THREADS="2",
                MKL_NUM_THREADS="2",
            )
            (directory / "execution.json").write_text(
                json.dumps(
                    {
                        "engine": "diffsbdd",
                        "backend": "local_process",
                        "source": str(source),
                        "runtime": str(root),
                        "manifest_sha256": self.settings.diffsbdd_manifest_sha256,
                    }
                )
            )
            return await local_process.start(
                python, Path(__file__).parent / "diffsbdd/runner.py", directory, env
            )
        return await self.opendde.start(job, directory)

    async def stop(self, job_id):
        # Never route using request.json: task directories contain untrusted scientific outputs.
        job = self.store.get(job_id)
        if job is None:
            raise RuntimeError("Cannot recover a process without its persisted task request.")
        directory = self.settings.state_dir / "jobs" / job.id
        if job.request.operation == "harness":
            await harness_process.stop(self.settings, directory)
        elif job.request.operation == "diffsbdd":
            await local_process.stop(Path(__file__).parent / "diffsbdd/runner.py", directory)
        else:
            await self.opendde.stop(job_id)

    async def readiness(self):
        # Preserve the existing OpenDDE health contract; expose other engines independently.
        opendde = await self.opendde.readiness()
        diff = await asyncio.to_thread(diff_readiness, self.settings)
        harness = {
            "ready": bool(self.settings.harness_python and self.settings.harness_python.is_file()),
            "compute_configured": bool(self.settings.harness_url),
        }
        return {**opendde, "backends": {"opendde": opendde, "diffsbdd": diff, "harness": harness}}
