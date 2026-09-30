"""One trusted routing authority for start, cancellation and restart recovery.

Capabilities describe scientific operations. Engines choose the scientific implementation.
Execution backends own process/container lifecycle. The existing Store remains task authority.
"""

import asyncio
import json
import logging
import os
from collections.abc import Awaitable

from . import harness_process, local_process
from .diffsbdd.runtime import configuration
from .diffsbdd.runtime import readiness as diff_readiness
from .docking.backend import DockingBackend
from .engine import DockerEngine
from .engine_registry import engine_for
from .execution_environment import capture as capture_environment
from .pockets.backend import PocketBackend
from .store import Store


class BackendRouter:
    def __init__(self, settings):
        self.settings = settings
        self.store = Store(settings.state_dir / "jobs.sqlite3")
        self.opendde = DockerEngine(settings)
        self.pockets = PocketBackend(settings)
        self.docking = DockingBackend(settings)

    async def start(self, job, directory):
        implementation = engine_for(job.request.operation).id
        if implementation not in {"opendde", "diffsbdd", "harness", "p2rank", "gnina"}:
            raise ValueError("No execution adapter for registered engine: " + implementation)
        environment = capture_environment(self.settings, implementation)
        self.store.bind_environment(job.id, environment)
        (directory / "environment.json").write_text(environment.model_dump_json(), encoding="utf-8")
        if implementation == "gnina":
            return await self.docking.start(job, directory)
        if implementation == "p2rank":
            return await self.pockets.start(job, directory)
        if implementation == "harness":
            return await harness_process.start(self.settings, directory)
        if implementation == "diffsbdd":
            python, source, root = configuration(self.settings)
            from .diffsbdd.snapshot import capture

            runner, adapter_digests = capture(directory)
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
                        "core_verification": "rdkit_fixed_core_v1",
                        "adapter_sha256": adapter_digests,
                        "environment_snapshot_sha256": environment.snapshot_sha256,
                        "backend": "local_process",
                        "source": str(source),
                        "runtime": str(root),
                        "manifest_sha256": self.settings.diffsbdd_manifest_sha256,
                    }
                )
            )
            return await local_process.start(python, runner, directory, env)
        if implementation == "opendde":
            return await self.opendde.start(job, directory)
        raise ValueError("No execution adapter for registered engine: " + implementation)

    async def stop(self, job_id):
        # Never route using request.json: task directories contain untrusted scientific outputs.
        job = self.store.get(job_id)
        if job is None:
            raise RuntimeError("Cannot recover a process without its persisted task request.")
        directory = self.settings.state_dir / "jobs" / job.id
        implementation = engine_for(job.request.operation).id
        if implementation == "gnina":
            await self.docking.stop(job.id, directory)
        elif implementation == "p2rank":
            await self.pockets.stop(job.id, directory)
        elif implementation == "harness":
            await harness_process.stop(self.settings, directory)
        elif implementation == "diffsbdd":
            await local_process.stop(directory / "adapter/runner.py", directory)
        elif implementation == "opendde":
            await self.opendde.stop(job_id)
        else:
            raise ValueError("No execution adapter for registered engine: " + implementation)

    async def readiness(self):
        # Preserve the existing OpenDDE health contract; expose other engines independently.
        opendde, diff, pockets, docking = await asyncio.gather(
            self._checked_readiness("opendde", self.opendde.readiness()),
            self._checked_readiness("diffsbdd", asyncio.to_thread(diff_readiness, self.settings)),
            self._checked_readiness("p2rank", self.pockets.readiness()),
            self._checked_readiness("gnina", self.docking.readiness()),
        )
        client_present = bool(
            self.settings.harness_python and self.settings.harness_python.is_file()
        )
        harness = {
            "ready": client_present,
            "reason": None
            if client_present
            else "Configure the native Harness interpreter, then restart X-DDE.",
            "compute_configured": bool(self.settings.harness_url),
        }
        return {
            **opendde,
            "backends": {
                "opendde": opendde,
                "diffsbdd": diff,
                "harness": harness,
                "p2rank": pockets,
                "gnina": docking,
            },
        }

    async def _checked_readiness(self, identifier: str, check: Awaitable[dict]) -> dict:
        try:
            result = await check
            if not isinstance(result, dict):
                raise ValueError("Engine returned an invalid runtime status.")
            return result
        except Exception as exc:
            # Diagnostics identify the failing adapter without exposing provider/config secrets.
            logging.getLogger(__name__).warning(
                "Scientific runtime check failed: engine=%s error_type=%s",
                identifier,
                type(exc).__name__,
            )
            return {
                "ready": False,
                "gpu": None,
                "reason": "Engine runtime check failed. Check installation and X-DDE logs.",
            }
