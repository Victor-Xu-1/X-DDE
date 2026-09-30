"""One durable queue consumer, with explicit process cleanup and recovery."""

import asyncio
import logging
import time
from pathlib import Path

from .assets import AssetStore
from .engine import Engine
from .models import Job, Status
from .research.outputs import OutputCatalog
from .settings import Settings
from .store import Store
from .task_io import prepare, successful

log = logging.getLogger(__name__)


class Worker:
    def __init__(
        self, store: Store, engine: Engine, settings: Settings, assets: AssetStore | None = None
    ):
        self.store, self.engine, self.settings = store, engine, settings
        self.assets = assets or AssetStore(store, settings.state_dir / "assets")
        self.outputs = OutputCatalog(store, self.assets)
        self.stopping = False
        self.error: str | None = None
        self.task: asyncio.Task | None = None
        self.gate = None
        self.waiting_reason: str | None = None

    async def start(self) -> None:
        halt = self.store.queue_halt()
        if halt:
            try:
                await self.engine.stop(halt["job_id"])
            except Exception:
                self.error = halt["reason"]
                log.exception("queue_recovery_still_unconfirmed job_id=%s", halt["job_id"])
            else:
                self.store.clear_queue_halt(halt["job_id"])
        for job in self.store.unfinished():
            try:
                await self.engine.stop(job.id)
            except Exception as exc:
                self.error = "Recovery could not confirm task cancellation; queue paused. " + (
                    str(exc) if isinstance(exc, RuntimeError) else "Inspect service logs."
                )
                log.exception("task_recovery_failed job_id=%s", job.id)
                self.store.pause_queue(job.id, self.error)
                self.store.finish(job.id, Status.FAILED, self.error)
                continue
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
            queued = self.store.next_queued()
            self.waiting_reason = None
            if queued and self.gate:
                try:
                    self.waiting_reason = await self.gate(queued)
                except (OSError, ValueError, RuntimeError, TimeoutError):
                    self.waiting_reason = (
                        "Cannot confirm native campaign state. "
                        "Restore Harness connectivity to resume GPU work."
                    )
                if self.waiting_reason:
                    await asyncio.sleep(1)
                    continue
            job = self.store.claim(queued.id) if queued else None
            if job is None:
                await asyncio.sleep(0.25)
                continue
            await self.execute(job)

    async def capture(self, stream: asyncio.StreamReader, path: Path) -> None:
        written = 0
        truncated = False
        secret = (self.settings.harness_token or "").encode()
        carry = b""
        with path.open("ab", buffering=0) as file:

            def write(data):
                nonlocal written, truncated
                remaining = max(0, self.settings.log_limit - written)
                file.write(data[:remaining])
                written += min(remaining, len(data))
                if len(data) > remaining and not truncated:
                    file.write(
                        b"\n[Log capture limit reached; remaining process output is discarded.]\n"
                    )
                    truncated = True

            while chunk := await stream.read(16384):
                data = carry + chunk
                if secret:
                    data = data.replace(secret, b"[redacted]")
                hold = max(0, len(secret) - 1)
                boundary = max(0, len(data) - hold)
                write(data[:boundary])
                carry = data[boundary:]
            write(carry.replace(secret, b"[redacted]") if secret else carry)

    async def execute(self, job: Job) -> None:
        directory = self.settings.state_dir / "jobs" / job.id
        directory.mkdir(parents=True, exist_ok=True)
        process = None
        reader = None
        started = time.monotonic()
        status, error = Status.FAILED, None
        try:
            prepare(job, directory, self.assets)
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
                timeout = (
                    24 * 3600 if job.request.operation == "resources" else self.settings.job_timeout
                )
                if time.monotonic() - started > timeout:
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
                if successful(job, directory, code):
                    status = Status.SUCCEEDED
                    index = await asyncio.to_thread(self.outputs.index, job, directory / "output")
                    if index["errors"]:
                        log.warning(
                            "task_asset_index_partial job_id=%s count=%s",
                            job.id,
                            len(index["errors"]),
                        )
                else:
                    missing = (
                        "no successful structure result"
                        if job.request.operation == "predict"
                        else "expected operation result is missing"
                    )
                    error = (
                        f"Scientific task exited with code {code}; {missing}. Inspect the task log."
                    )
        except Exception as exc:
            error = f"Task execution failed: {type(exc).__name__}. Inspect the task log."
            with (directory / "run.log").open("a") as file:
                file.write(f"\n{type(exc).__name__}: {exc}\n")
            log.exception("task_execution_failed job_id=%s", job.id)
        finally:
            try:
                await self.engine.stop(job.id)
            except Exception as cleanup_error:
                self.error = "Task cleanup/cancellation is unconfirmed; queue paused. " + (
                    str(cleanup_error)
                    if isinstance(cleanup_error, RuntimeError)
                    else "Inspect service logs before restarting."
                )
                log.exception("task_cleanup_failed job_id=%s", job.id)
                self.store.pause_queue(job.id, self.error)
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
