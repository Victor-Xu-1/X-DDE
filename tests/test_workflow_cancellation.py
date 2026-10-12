"""Durable cancellation through real SQLite, ASGI and the sole Worker; no science."""

import asyncio
import sqlite3
import subprocess
import sys
import textwrap
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from uuid import uuid4

import httpx2 as httpx
import pytest
from conftest import ProcessEngine

from opendde_workbench import api
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.store import ConflictError, Store
from opendde_workbench.worker import Worker
from opendde_workbench.workflows.contracts import PlanInput
from opendde_workbench.workflows.service import WorkflowService
from opendde_workbench.workflows.storage import WorkflowRecords


async def available(request):
    """Only availability is stubbed; no native service or model is used."""


def setup_run(settings, count=2, request=None):
    store = Store(settings.state_dir / "jobs.sqlite3")
    records = WorkflowRecords(store)
    value = PlanInput.model_validate(
        {
            "name": "cancellation fixture",
            "steps": [
                {
                    "id": f"step{i}",
                    "request": request or {"operation": "doctor", "name": f"step{i}"},
                }
                for i in range(count)
            ],
            "budget": {"max_jobs": count, "wall_seconds": 60},
        }
    )
    saved = records.save_plan(value, uuid4())
    run = records.start(saved["id"], saved["sha256"], uuid4())
    engine = ProcessEngine("print('controlled cancellation fixture')")
    worker = Worker(store, engine, settings)
    service = WorkflowService(records, worker, available, settings)
    worker.before_claim = service.tick
    worker.on_progress = service.check_running_budgets
    return store, records, service, run["id"]


def queue_all(service, count=2):
    for _ in range(count):
        asyncio.run(service.tick())


def states(records, run_id):
    run = records.run(run_id)
    return run["state"], [attempt["status"] for attempt in run["attempts"]]


@contextmanager
def racing_write(store, monkeypatch, write_prefix):
    """Pause a real write transaction; observe the cancelling writer wait on it."""
    writing, cancel_waiting, release = (threading.Event() for _ in range(3))
    original = store.connect

    def trace(sql):
        if sql.startswith(write_prefix) and not writing.is_set():
            writing.set()
            assert release.wait(5), "Concurrent writer was not released"
        elif sql == "BEGIN IMMEDIATE" and writing.is_set():
            cancel_waiting.set()

    @contextmanager
    def connected():
        with original() as db:
            db.set_trace_callback(trace)
            yield db

    with monkeypatch.context() as patch:
        patch.setattr(store, "connect", connected)
        try:
            yield writing, cancel_waiting, release
        finally:
            release.set()


def test_asgi_cancel_includes_concurrently_committing_attempt(settings, monkeypatch):
    captured = []
    register = api.register_workflows

    def capture(*args):
        service = register(*args)
        captured.append(service)
        return service

    monkeypatch.setattr(api, "register_workflows", capture)
    # No app lifespan: this test starts only the scheduler hook, never deployments.
    app = api.create_app(settings, ProcessEngine())
    service = captured[0]
    service.preflight = available
    _, records, _, run_id = setup_run(settings)
    queue_all(service, 1)

    async def check():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:4320"
        ) as client:
            token = (await client.get("/api/session")).json()["csrf_token"]
            with racing_write(service.records.store, monkeypatch, "INSERT INTO jobs(") as gates:
                writing, waiting, release = gates
                scheduler = asyncio.create_task(
                    asyncio.to_thread(lambda: asyncio.run(service.tick()))
                )
                assert await asyncio.to_thread(writing.wait, 5)
                cancellation = asyncio.create_task(
                    client.post(
                        f"/api/workflows/runs/{run_id}/cancel",
                        headers={"X-Workbench-CSRF": token, "Origin": "http://127.0.0.1:4320"},
                    )
                )
                try:
                    assert await asyncio.to_thread(waiting.wait, 5)
                finally:
                    release.set()
                await scheduler
                response = await cancellation
            assert response.status_code == 200, response.text
            assert states(records, run_id) == ("cancelling", ["cancelled", "cancelled"])
            assert service.records.store.claim() is None

    asyncio.run(check())


def test_process_exit_during_cancel_rolls_back_entire_transition(settings):
    store, records, service, run_id = setup_run(settings)
    queue_all(service)
    before = records.run(run_id)
    code = textwrap.dedent(
        """
        import os, sys
        from contextlib import contextmanager
        from pathlib import Path
        from opendde_workbench.store import Store
        from opendde_workbench.workflows.storage import WorkflowRecords
        from opendde_workbench.workflows.service import WorkflowService
        store = Store(Path(sys.argv[1]))
        records = WorkflowRecords(store)
        original = store.connect
        writes = 0
        def crash(sql):
            global writes
            if sql.startswith("UPDATE jobs SET status="):
                writes += 1
                if writes == 2:
                    os._exit(73)
        @contextmanager
        def connected():
            with original() as db:
                db.set_trace_callback(crash)
                yield db
        store.connect = connected
        WorkflowService(records, None, None, None).cancel(sys.argv[2])
        raise AssertionError("Crash boundary was not reached")
        """
    )
    result = subprocess.run([sys.executable, "-c", code, str(store.path), run_id], timeout=10)
    assert result.returncode == 73
    reopened = WorkflowRecords(Store(store.path))
    assert reopened.run(run_id) == before
    # A retry after the actual process exit cancels the same immutable attempts.
    service.cancel(run_id)
    assert states(reopened, run_id) == ("cancelling", ["cancelled", "cancelled"])


def test_write_failure_rolls_back_and_retry_preserves_job_identity(settings):
    store, records, service, run_id = setup_run(settings)
    queue_all(service)
    before = records.run(run_id)
    second = before["attempts"][1]["job_id"]
    with store.connect() as db:
        db.execute(
            "CREATE TRIGGER fail_cancel BEFORE UPDATE OF status ON jobs "
            f"WHEN OLD.id='{second}' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END"
        )
    with pytest.raises(sqlite3.IntegrityError, match="injected write failure"):
        service.cancel(run_id)
    assert records.run(run_id) == before
    with store.connect() as db:
        db.execute("DROP TRIGGER fail_cancel")
    service.cancel(run_id)
    assert states(records, run_id) == ("cancelling", ["cancelled", "cancelled"])
    assert [a["job_id"] for a in records.run(run_id)["attempts"]] == [
        a["job_id"] for a in before["attempts"]
    ]


def test_running_synchronous_claim_is_checked_inside_cancellation_transaction(
    settings, monkeypatch
):
    request = {"operation": "harness", "name": "synchronous fixture", "tool": "esm"}
    store, records, service, run_id = setup_run(settings, request=request)
    queue_all(service)
    before = records.run(run_id)
    with ThreadPoolExecutor(max_workers=2) as pool:
        with racing_write(store, monkeypatch, "UPDATE jobs SET status='running'") as gates:
            writing, waiting, release = gates
            claim = pool.submit(store.claim)
            assert writing.wait(5)
            cancellation = pool.submit(service.cancel, run_id)
            try:
                assert waiting.wait(5)
            finally:
                release.set()
            assert claim.result(timeout=5).id == before["attempts"][0]["job_id"]
            with pytest.raises(ConflictError, match="synchronous"):
                cancellation.result(timeout=5)
    assert states(records, run_id) == ("running", ["running", "queued"])


def test_cancel_committed_before_claim_prevents_dispatch(settings):
    store, records, service, run_id = setup_run(settings)
    queue_all(service)
    service.cancel(run_id)
    assert store.claim() is None
    assert states(records, run_id) == ("cancelling", ["cancelled", "cancelled"])


def test_restart_reconciles_legacy_partial_cancellation_before_worker_dispatch(settings):
    store, records, service, run_id = setup_run(settings)
    queue_all(service)
    first = store.claim()
    store.cancel(first.id)
    # Persist the old split-transaction crash boundary, with a never-started queued child.
    records.change(run_id, "cancelling")
    reopened_store = Store(store.path)
    reopened = WorkflowRecords(reopened_store)
    engine = ProcessEngine("print('must not dispatch')")
    worker = Worker(reopened_store, engine, settings)
    resumed = WorkflowService(reopened, worker, available, settings)
    worker.before_claim = resumed.tick

    async def check():
        await worker.start()
        try:
            async with asyncio.timeout(5):
                while reopened.run(run_id)["state"] != "cancelled":
                    assert not worker.task.done(), worker.error
                    await asyncio.sleep(0.01)
        finally:
            await worker.close()
        assert not worker.error

    asyncio.run(check())
    assert engine.started == []
    assert engine.stopped == [first.id]
    assert states(reopened, run_id) == ("cancelled", ["interrupted", "cancelled"])


def test_reconciliation_cancels_queued_children_but_waits_for_active_synchronous_tool(settings):
    request = {"operation": "harness", "name": "synchronous fixture", "tool": "esm"}
    store, records, service, run_id = setup_run(settings, request=request)
    queue_all(service)
    active = store.claim()
    records.change(run_id, "cancelling")
    asyncio.run(service.tick())
    assert states(records, run_id) == ("cancelling", ["running", "cancelled"])
    assert service.worker.engine.stopped == []
    store.finish(active.id, Status.SUCCEEDED)
    asyncio.run(service.tick())
    assert states(records, run_id) == ("cancelled", ["succeeded", "cancelled"])


def test_cancellation_preserves_terminal_unrelated_and_immutable_records(settings):
    store, records, service, run_id = setup_run(settings, count=3)
    queue_all(service, 3)
    completed = store.claim()
    store.finish(completed.id, Status.SUCCEEDED)
    active = store.claim()
    unrelated = store.create(
        TASK_ADAPTER.validate_python({"operation": "doctor", "name": "unrelated"}),
        str(uuid4()),
        20,
        100,
    )
    before = {job.id: job.model_dump() for job in store.list_jobs()}
    immutable_query = (
        "SELECT id,request,request_hash,idempotency_key,parent_id,created_at FROM jobs ORDER BY id"
    )
    with store.connect() as db:
        immutable = list(db.execute(immutable_query))
    plan = records.plan(records.run(run_id)["plan_id"])
    result = service.cancel(run_id)
    assert [a["status"] for a in result["attempts"]] == ["succeeded", "cancelling", "cancelled"]
    assert store.get(active.id).finished_at is None
    assert service.worker.engine.stopped == []
    assert store.get(completed.id).model_dump() == before[completed.id]
    assert store.get(unrelated.id).model_dump() == before[unrelated.id]
    with store.connect() as db:
        assert list(db.execute(immutable_query)) == immutable
    assert records.plan(plan["id"]) == plan
    again = service.cancel(run_id)
    assert again["state"] == result["state"] and again["attempts"] == result["attempts"]
    assert records.enqueue(run_id, "step2", unrelated.request, 20, 100) is None
    store.finish(active.id, Status.CANCELLED)
    asyncio.run(service.tick())
    with pytest.raises(ConflictError):
        service.cancel(run_id)
    with pytest.raises(KeyError):
        service.cancel(str(uuid4()))


def test_recovery_failure_pauses_worker_and_retry_never_dispatches_partial_children(settings):
    store, records, service, run_id = setup_run(settings)
    queue_all(service)
    records.change(run_id, "cancelling")
    before = records.run(run_id)
    second = before["attempts"][1]["job_id"]
    with store.connect() as db:
        db.execute(
            "CREATE TRIGGER fail_recovery BEFORE UPDATE OF status ON jobs "
            f"WHEN OLD.id='{second}' BEGIN SELECT RAISE(ABORT, 'injected recovery failure'); END"
        )

    async def check():
        await service.worker.start()
        try:
            async with asyncio.timeout(5):
                await service.worker.task
        finally:
            await service.worker.close()
        assert service.worker.error and "recovery failed" in service.worker.error
        assert service.worker.engine.started == []
        assert records.run(run_id) == before
        with store.connect() as db:
            db.execute("DROP TRIGGER fail_recovery")
        reopened = WorkflowRecords(Store(store.path))
        engine = ProcessEngine("print('must not dispatch after retry')")
        worker = Worker(reopened.store, engine, settings)
        resumed = WorkflowService(reopened, worker, available, settings)
        worker.before_claim = resumed.tick
        await worker.start()
        try:
            async with asyncio.timeout(5):
                while reopened.run(run_id)["state"] != "cancelled":
                    assert not worker.task.done(), worker.error
                    await asyncio.sleep(0.01)
        finally:
            await worker.close()
        assert engine.started == [] and worker.error is None
        assert states(reopened, run_id) == ("cancelled", ["cancelled", "cancelled"])

    asyncio.run(check())


def test_recovery_covers_all_pages_without_skipping_runs_that_finish(settings):
    store, records, service, run_id = setup_run(settings, count=1)
    saved = records.plan(records.run(run_id)["plan_id"])
    runs = [run_id]
    # First page includes one missing job, which must stay visibly unresolved.
    with store.connect() as db:
        db.execute(
            "INSERT INTO workflow_attempts VALUES(?,?,?,?,?)",
            (
                run_id,
                "step0",
                0,
                str(uuid4()),
                "2000-01-01T00:00:00+00:00",
            ),
        )
    records.change(run_id, "cancelling")
    for _ in range(101):
        identifier = records.start(saved["id"], saved["sha256"], uuid4())["id"]
        records.enqueue(
            identifier,
            "step0",
            TASK_ADAPTER.validate_python({"operation": "doctor", "name": "never dispatched"}),
            200,
            200,
        )
        records.change(identifier, "cancelling")
        runs.append(identifier)
    asyncio.run(service.tick())
    assert states(records, run_id) == ("cancelling", ["missing"])
    assert all(
        states(records, identifier) == ("cancelled", ["cancelled"]) for identifier in runs[1:]
    )
    assert store.claim() is None
