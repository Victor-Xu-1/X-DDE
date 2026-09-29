"""Derived analysis for completed tasks, computed by the installed scientific runtime."""

import asyncio
import json
import os
from pathlib import Path

from .engine import DockerEngine, command
from .models import Job


class AnalysisService:
    def __init__(self, engine: DockerEngine, jobs_root: Path):
        self.engine, self.jobs_root = engine, jobs_root
        self.lock = asyncio.Lock()

    async def get(self, job: Job) -> dict:
        directory = self.jobs_root / job.id
        target = directory / "output/workbench-analysis.json"
        async with self.lock:
            if target.is_file():
                cached = json.loads(target.read_text())
                if cached.get("schema_version") == 3:
                    return cached
            image, _ = self.engine.runtime()
            script = Path(__file__).parent
            name = "opendde-wb-analysis-" + job.id
            # A crashed server can leave only this task's named analysis container behind.
            await command("docker", "rm", "--force", name)
            try:
                code, output = await command(
                    "docker",
                    "run",
                    "--name",
                    name,
                    "--network",
                    "none",
                    "--memory",
                    "2g",
                    "--user",
                    f"{os.getuid()}:{os.getgid()}",
                    "--mount",
                    f"type=bind,source={directory},target=/job",
                    "--mount",
                    f"type=bind,source={script},target=/adapter,readonly",
                    "--entrypoint",
                    "python",
                    image,
                    "/adapter/compute_analysis.py",
                    timeout=60,
                )
            finally:
                await command("docker", "rm", "--force", name)
            if code or not target.is_file():
                # Keep computation diagnostics with the task, not in a public response.
                (directory / "analysis-error.log").write_text(output)
                raise RuntimeError(
                    "Scientific analysis failed; prediction artifacts remain available."
                )
            return json.loads(target.read_text())
