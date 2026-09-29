"""One durable queue consumer, with explicit process cleanup and recovery."""

import asyncio
import json
import logging
import time
from pathlib import Path

from .artifacts import list_artifacts
from .engine import Engine
from .models import Job, Status
from .settings import Settings
from .store import Store

log = logging.getLogger(__name__)


class Worker:
    def __init__(self, store: Store, engine: Engine, settings: Settings):
        self.store, self.engine, self.settings = store, engine, settings
        self.stopping = False
        self.error: str | None = None
        self.task: asyncio.Task | None = None

    async def start(self) -> None:
        for job in self.store.unfinished():
            await self.engine.stop(job.id)
            self.store.finish(
                job.id, Status.INTERRUPTED, "Service restarted while the task was active."
            )
        self.task = asyncio.create_task(self.run(), name="opendde-workbench-worker")

    async def close(self) -> None:
        self.stopping = True
        if self.task:
            await self.task

    async def run(self) -> None:
        while not self.stopping and not self.error:
            job = self.store.claim()
            if job is None:
                await asyncio.sleep(0.25)
                continue
            await self.execute(job)

    async def capture(self, stream: asyncio.StreamReader, path: Path) -> None:
        written = 0
        truncated = False
        with path.open("ab", buffering=0) as file:
            while chunk := await stream.read(16384):
                remaining = max(0, self.settings.log_limit - written)
                file.write(chunk[:remaining])
                written += min(remaining, len(chunk))
                if len(chunk) > remaining and not truncated:
                    file.write(
                        b"\n[Log capture limit reached; remaining process output is discarded.]\n"
                    )
                    truncated = True

    async def execute(self, job: Job) -> None:
        directory = self.settings.state_dir / "jobs" / job.id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "input.json").write_text(
            json.dumps(job.request.inference_input(job.id)), encoding="utf-8"
        )
        process = None
        reader = None
        started = time.monotonic()
        status, error = Status.FAILED, None
        try:
            process = await self.engine.start(job, directory)
            reader = asyncio.create_task(self.capture(process.stdout, directory / "run.log"))
            while process.returncode is None:
                current = self.store.get(job.id)
                if current.status == Status.CANCELLING or self.stopping:
                    status = (
                        Status.CANCELLED
                        if current.status == Status.CANCELLING
                        else Status.INTERRUPTED
                    )
                    error = (
                        None
                        if status == Status.CANCELLED
                        else "Service stopped while the task was active."
                    )
                    await self.engine.stop(job.id)
                    break
                if time.monotonic() - started > self.settings.job_timeout:
                    error = "Task exceeded its execution time limit."
                    await self.engine.stop(job.id)
                    break
                size = sum(
                    p.stat().st_size
                    for p in directory.rglob("*")
                    if p.is_file() and not p.is_symlink()
                )
                if size > 1024**3:
                    error = "Task output exceeded the 1 GiB limit."
                    await self.engine.stop(job.id)
                    break
                await asyncio.sleep(0.4)
            code = await asyncio.wait_for(process.wait(), 10)
            await reader
            if error is None and status not in {Status.CANCELLED, Status.INTERRUPTED}:
                structures = [
                    item
                    for item in list_artifacts(directory / "output")
                    if item.name.endswith(".cif") and item.size > 0
                ]
                if code == 0 and structures:
                    status = Status.SUCCEEDED
                else:
                    error = (
                        f"OpenDDE exited with code {code}; no successful structure result. "
                        "Inspect the task log."
                    )
        except Exception as exc:
            error = f"Task execution failed: {type(exc).__name__}. Inspect the task log."
            with (directory / "run.log").open("a") as file:
                file.write(f"\n{type(exc).__name__}: {exc}\n")
            log.exception("task_execution_failed job_id=%s", job.id)
        finally:
            try:
                await self.engine.stop(job.id)
            except Exception:
                self.error = (
                    "Container cleanup failed; queue paused. "
                    "Inspect service logs before restarting."
                )
                log.exception("task_cleanup_failed job_id=%s", job.id)
                status, error = Status.FAILED, self.error
            if process and process.returncode is None:
                process.kill()
                await process.wait()
            if reader and not reader.done():
                reader.cancel()
            if reader:
                await asyncio.gather(reader, return_exceptions=True)
            self.store.finish(job.id, status, error)
            log.info("task_finished job_id=%s status=%s", job.id, status)
