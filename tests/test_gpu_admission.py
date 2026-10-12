"""Shared resource admission uses real SQLite and non-executing native boundaries."""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import replace
from threading import Event
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.harness_service import HarnessService
from opendde_workbench.native_arguments import needs_gpu
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.store import ConflictError, Store
from opendde_workbench.worker import Worker

DATASETS = ["drugclip_index", "drugclip_retrieve", "screening_dock"]
# Existing CPU predictions and resource downloads still exclude a new campaign.
CASES = [
    (operation, device, device == "cuda", device == "cuda")
    for operation in DATASETS + ["ligandmpnn_design", "docking"]
    for device in ["cpu", "cuda"]
] + [
    ("predict", "cpu", False, True),
    ("predict", "cuda", True, True),
    ("resources", "cpu", False, True),
    ("identity", "cpu", False, False),
    ("generate", "cuda", True, True),
    *[(tool, "cuda", True, True) for tool in ["esm", "esm2", "mpnn", "fold"]],
    ("compare", "cpu", False, False),
]


def request_for(operation, device, ref):
    search = {
        "kind": "box",
        "frame": ref,
        "box": {"center": [0, 0, 0], "size": [20, 20, 20]},
    }
    data = {"name": "Resource contract", "operation": operation}
    if operation in DATASETS:
        role = {"drugclip_index": "library", "drugclip_retrieve": "index"}.get(
            operation, "screening"
        )
        data.update(
            sources=[{"job_id": str(uuid4()), "report_sha256": "b" * 64, "role": role}],
            options={"device": device},
        )
        if operation == "screening_dock":
            payload = {
                "kind": "gnina",
                "selected_ids": ["candidate-1"],
                "docking": {"use_gpu": device == "cuda"},
            }
        else:
            payload = {
                "kind": "drugclip",
                "mode": operation.removeprefix("drugclip_"),
                "use": "non_commercial",
            }
        if operation != "drugclip_index":
            data.update(inputs=[{"role": "structure", "source": ref}], scientific_inputs=[ref])
            payload.update(receptor=ref, search=search)
        data["payload"] = payload
    elif operation == "predict":
        data.update(
            components=[{"kind": "ligand", "value": "CCO"}],
            parameters={"device": device, "dtype": "fp32"},
        )
    elif operation == "resources":
        data.update(targets=["standard"], allow_network=True)
    elif operation == "ligandmpnn_design":
        data.update(
            inputs=[{"role": "structure", "source": ref}],
            scientific_inputs=[ref],
            options={"device": device},
            payload={"kind": "ligandmpnn", "redesigned_residues": ["A1"]},
        )
    elif operation == "docking":
        data.update(receptor=ref, ligand=ref, search=search, options={"use_gpu": device == "cuda"})
    elif operation in {"identity", "generate"}:
        data.update(operation="diffsbdd", payload={"mode": operation})
        if operation == "identity":
            data["payload"]["molecule"] = ref
        else:
            data["payload"].update(
                protein=ref,
                pocket={
                    "kind": "residues",
                    "residues": [{"structure": ref, "chain": "A", "number": 1}],
                },
            )
    else:
        data.update(operation="harness", tool=operation, allow_external=operation == "fold")
    return TASK_ADAPTER.validate_python(data)


@pytest.fixture
def admission(settings, monkeypatch):
    settings = replace(settings, harness_python=settings.state_dir / "unused-native-python")
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    asset = assets.save("input.pdb", "structure", b"ATOM\n")
    service = HarnessService(settings, store, assets)
    calls = []

    async def boundary(message, timeout=45):
        calls.append(message["operation"])
        if message["operation"] == "validate":
            return {"summary": {"target": "Resource contract"}}
        if message["operation"] == "active":
            return True
        if message["operation"] == "reconcile":
            return {"found": False}
        assert message["operation"] == "start"
        return {"task_id": "intercepted-native-task"}

    monkeypatch.setattr(service, "invoke", boundary)
    monkeypatch.setattr(service, "config_path", lambda plan: "intercepted-design.json")
    plan = asyncio.run(service.validate({"design": {"n_cycles": 1}}, uuid4()))
    calls.clear()
    return SimpleNamespace(
        service=service,
        store=store,
        settings=settings,
        assets=assets,
        plan=plan,
        ref={"asset_id": asset.id, "sha256": asset.sha256},
        calls=calls,
    )


def enqueue(admission, request, status="queued"):
    job = admission.store.create(request, str(uuid4()), 20, 500)
    if status in {"running", "cancelling"}:
        job = admission.store.claim(job.id)
    if status == "cancelling":
        job = admission.store.cancel(job.id)
    return job


def campaign_state(admission, state):
    with admission.store.connect() as db:
        db.execute("UPDATE design_plans SET state=? WHERE id=?", (state, admission.plan["id"]))


@pytest.mark.parametrize("operation,device,gpu,blocks_start", CASES)
@pytest.mark.parametrize("state", ["dispatching", "uncertain", "started", "validated"])
def test_queue_gate_uses_validated_resource_policy(
    admission, operation, device, gpu, blocks_start, state
):
    request = request_for(operation, device, admission.ref)
    assert needs_gpu(request) is gpu
    campaign_state(admission, state)
    reason = asyncio.run(admission.service.queue_gate(SimpleNamespace(request=request)))
    blocked = (gpu or operation == "resources") and state != "validated"
    assert bool(reason) is blocked
    assert admission.calls == (["active"] if blocked and state == "started" else [])


@pytest.mark.parametrize("operation,device,gpu,blocks_start", CASES)
@pytest.mark.parametrize("status", ["queued", "running", "cancelling"])
def test_campaign_start_respects_pending_resource_policy(
    admission, operation, device, gpu, blocks_start, status
):
    enqueue(admission, request_for(operation, device, admission.ref), status)
    start = admission.service.start(admission.plan["id"], admission.plan["digest"])
    if blocks_start:
        with pytest.raises(ConflictError, match="Wait for queued or active"):
            asyncio.run(start)
        assert admission.service.plan(admission.plan["id"])["state"] == "validated"
        assert admission.calls == []
    else:
        assert asyncio.run(start)["state"] == "started"
        assert admission.calls == ["start"]


@pytest.mark.parametrize("status", ["queued", "running", "cancelling"])
@pytest.mark.parametrize("invalid", ["{", '{"operation":"unknown"}', '{"operation":"resources"}'])
def test_invalid_pending_requests_fail_closed_before_native_dispatch(admission, status, invalid):
    job = enqueue(admission, request_for("drugclip_index", "cuda", admission.ref), status)
    with admission.store.connect() as db:
        db.execute("UPDATE jobs SET request=? WHERE id=?", (invalid, job.id))
    with pytest.raises(ConflictError, match="invalid saved request"):
        asyncio.run(admission.service.start(admission.plan["id"], admission.plan["digest"]))
    assert admission.service.plan(admission.plan["id"])["state"] == "validated"
    assert admission.calls == []


def test_invalid_dataset_device_cannot_silently_become_cpu(admission):
    job = enqueue(admission, request_for("drugclip_index", "cuda", admission.ref))
    invalid = job.request.model_dump(mode="json")
    invalid["options"]["device"] = "unrecognized"
    with admission.store.connect() as db:
        db.execute("UPDATE jobs SET request=? WHERE id=?", (json.dumps(invalid), job.id))
    with pytest.raises(ConflictError, match="invalid saved request"):
        asyncio.run(admission.service.start(admission.plan["id"], admission.plan["digest"]))
    assert admission.calls == []


@pytest.mark.parametrize("status", ["succeeded", "failed", "interrupted", "cancelled"])
def test_terminal_gpu_tasks_do_not_prevent_campaign_start(admission, status):
    job = enqueue(admission, request_for("drugclip_index", "cuda", admission.ref), "running")
    admission.store.finish(job.id, status)
    assert (
        asyncio.run(admission.service.start(admission.plan["id"], admission.plan["digest"]))[
            "state"
        ]
        == "started"
    )


def test_reconciliation_bypasses_admission_without_restarting_native_work(admission):
    enqueue(admission, request_for("drugclip_index", "cuda", admission.ref))
    campaign_state(admission, "uncertain")
    result = asyncio.run(
        admission.service.start(
            admission.plan["id"],
            admission.plan["digest"],
            reconcile=True,
        )
    )
    assert result["state"] == "validated" and result["task_id"] is None
    assert admission.calls == ["reconcile"]


@pytest.mark.parametrize("state", ["dispatching", "uncertain", "started"])
def test_worker_does_not_claim_gpu_dataset_while_campaign_owns_resources(admission, state):
    campaign_state(admission, state)
    job = enqueue(admission, request_for("drugclip_index", "cuda", admission.ref))
    worker = Worker(admission.store, object(), admission.settings, admission.assets)

    async def gate(queued):
        reason = await admission.service.queue_gate(queued)
        worker.stopping = True
        return reason

    worker.gate = gate
    asyncio.run(worker.run())
    assert worker.waiting_reason
    assert admission.store.get(job.id).status == "queued"


@pytest.mark.parametrize("first", ["task", "campaign"])
def test_concurrent_admission_serializes_on_existing_sqlite_transaction(
    admission, monkeypatch, first
):
    locked, release, attempted = Event(), Event(), Event()
    request = request_for("drugclip_index", "cuda", admission.ref)

    def pause(result):
        locked.set()
        assert release.wait(5), "Test did not release the admission transaction."
        return result

    if first == "task":
        original = admission.store._create_in_transaction
        monkeypatch.setattr(
            admission.store, "_create_in_transaction", lambda *a, **kw: pause(original(*a, **kw))
        )
    else:
        original = admission.service.plan_in
        monkeypatch.setattr(admission.service, "plan_in", lambda *a: pause(original(*a)))

    def start():
        try:
            return asyncio.run(
                admission.service.start(admission.plan["id"], admission.plan["digest"])
            )
        except ConflictError:
            return "blocked"

    def create():
        return enqueue(admission, request)

    original_connect = admission.store.connect

    @contextmanager
    def traced_connect():
        with original_connect() as db:
            # SQLite traces BEGIN before it waits for the first connection's write lock.
            def trace(statement):
                if statement == "BEGIN IMMEDIATE" and locked.is_set():
                    attempted.set()

            db.set_trace_callback(trace)
            yield db

    monkeypatch.setattr(admission.store, "connect", traced_connect)

    with ThreadPoolExecutor(max_workers=2) as pool:
        leading = pool.submit(create if first == "task" else start)
        try:
            assert locked.wait(5)
            following = pool.submit(start if first == "task" else create)
            assert attempted.wait(5)
            assert not following.done()
        finally:
            release.set()
        a, b = leading.result(timeout=5), following.result(timeout=5)
    job, campaign = (a, b) if first == "task" else (b, a)
    assert admission.store.get(job.id).status == "queued"
    reason = asyncio.run(admission.service.queue_gate(job))
    if first == "task":
        assert campaign == "blocked" and reason is None
        assert admission.calls == []
    else:
        assert campaign["state"] == "started" and reason
        assert admission.calls == ["start", "active"]


def test_pending_gpu_job_still_blocks_campaign_while_active_probe_is_awaited(
    admission, monkeypatch
):
    campaign_state(admission, "started")
    second_plan = asyncio.run(admission.service.validate({"design": {"n_cycles": 2}}, uuid4()))
    job = enqueue(admission, request_for("drugclip_index", "cuda", admission.ref))

    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()

        async def boundary(message, timeout=45):
            assert message["operation"] == "active"
            entered.set()
            await release.wait()
            return False

        monkeypatch.setattr(admission.service, "invoke", boundary)
        probe = asyncio.create_task(admission.service.queue_gate(job))
        await asyncio.wait_for(entered.wait(), 2)
        try:
            with pytest.raises(ConflictError):
                await admission.service.start(second_plan["id"], second_plan["digest"])
        finally:
            release.set()
        assert await probe is None
        assert admission.store.claim(job.id).status == "running"
        with pytest.raises(ConflictError):
            await admission.service.start(second_plan["id"], second_plan["digest"])
        assert admission.service.plan(second_plan["id"])["state"] == "validated"

    asyncio.run(scenario())


@pytest.mark.parametrize("operation", DATASETS)
def test_inactive_campaign_releases_gpu_dataset_gate(admission, monkeypatch, operation):
    campaign_state(admission, "started")

    async def inactive(message, timeout=45):
        assert message["operation"] == "active"
        return False

    monkeypatch.setattr(admission.service, "invoke", inactive)
    job = enqueue(admission, request_for(operation, "cuda", admission.ref))
    assert asyncio.run(admission.service.queue_gate(job)) is None
    assert admission.store.claim(job.id).status == "running"


@pytest.mark.parametrize("operation", DATASETS)
def test_unconfigured_harness_preserves_existing_dataset_admission(admission, operation):
    admission.service.settings = replace(admission.settings, harness_python=None)
    campaign_state(admission, "uncertain")
    job = enqueue(admission, request_for(operation, "cuda", admission.ref))
    assert asyncio.run(admission.service.queue_gate(job)) is None
    assert admission.calls == []


@pytest.mark.parametrize("operation", DATASETS)
def test_default_dataset_execution_options_remain_cpu(admission, operation):
    data = request_for(operation, "cpu", admission.ref).model_dump(mode="json")
    data.pop("options")
    request = TASK_ADAPTER.validate_python(data)
    assert request.options.device == "cpu" and not needs_gpu(request)
    enqueue(admission, request)
    campaign_state(admission, "started")
    assert asyncio.run(admission.service.queue_gate(SimpleNamespace(request=request))) is None
    campaign_state(admission, "validated")
    assert (
        asyncio.run(admission.service.start(admission.plan["id"], admission.plan["digest"]))[
            "state"
        ]
        == "started"
    )
