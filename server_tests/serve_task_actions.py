"""Isolated queue/control acceptance: real worker processes, no scientific outputs."""

import argparse
import asyncio
import os
import sys
from dataclasses import replace
from pathlib import Path

import uvicorn

from opendde_workbench.api import create_app
from opendde_workbench.settings import Settings


class LifecycleEngine:
    def __init__(self):
        self.processes = {}

    async def readiness(self):
        return {
            "ready": True,
            "gpu": None,
            "reason": None,
            "fixture": "Controlled lifecycle only; no scientific inference",
        }

    async def start(self, job, directory):
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            "-c",
            "import time; time.sleep(120)",
            cwd=directory,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self.processes[job.id] = process
        return process

    async def stop(self, job_id):
        process = self.processes.get(job_id)
        if process and process.returncode is None:
            process.kill()
            await process.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    settings = replace(
        Settings.from_env(),
        minimum_free_bytes=0,
        allowed_origins=(f"http://127.0.0.1:{args.port}",),
    )
    assert settings.state_dir.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    uvicorn.run(create_app(settings, LifecycleEngine()), host="127.0.0.1", port=args.port)
