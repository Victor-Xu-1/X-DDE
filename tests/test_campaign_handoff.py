"""Native IPC is isolated; these tests establish the real durable handoff invariants only."""

import asyncio
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.harness_contract import HarnessTask, validate_payload
from opendde_workbench.harness_service import HarnessService
from opendde_workbench.store import ConflictError, Store


def test_uncertain_native_start_is_not_automatically_repeated(settings, monkeypatch):
    store = Store(settings.state_dir / "jobs.sqlite3")
    service = HarnessService(settings, store, AssetStore(store, settings.state_dir / "assets"))
    calls = []

    async def boundary(message, timeout=45):
        calls.append(message["operation"])
        if message["operation"] == "validate":
            return {"summary": {"target": "protocol fixture"}}
        raise TimeoutError("response lost")

    monkeypatch.setattr(service, "invoke", boundary)

    async def scenario():
        key = uuid4()
        plan = await service.validate({"design": {"n_cycles": 1, "num_sequences": 2}}, key)
        assert (await service.validate({"design": {"n_cycles": 1, "num_sequences": 2}}, key))[
            "id"
        ] == plan["id"]
        with pytest.raises(TimeoutError):
            await service.start(plan["id"], plan["digest"])
        assert service.plan(plan["id"])["state"] == "uncertain"
        with pytest.raises(ConflictError):
            await service.start(plan["id"], plan["digest"])
        assert calls.count("start") == 1

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "payload",
    [
        {"structure_path": "/etc/passwd"},
        {"options": {"api_url": "http://169.254.169.254"}},
        {"parameters": {"cache_dir": "/tmp"}},
        {"options": {"command": "sh -c true"}},
        {"initial_structure_path": "https://example.com/input.pdb"},
    ],
)
def test_browser_cannot_override_execution_or_filesystem_boundaries(payload):
    with pytest.raises(ValueError):
        validate_payload(payload)


def test_stub_developability_is_not_accepted_as_a_scientific_tool():
    with pytest.raises(ValueError):
        HarnessTask(name="unsupported", tool="developability", payload={})


def test_external_search_requires_explicit_consent():
    with pytest.raises(ValueError, match="external"):
        HarnessTask(name="search", tool="protrek-sequence", payload={"sequence": "ACDE"})


def test_reconciliation_without_native_task_restores_reviewable_plan(settings, monkeypatch):
    store = Store(settings.state_dir / "jobs.sqlite3")
    service = HarnessService(settings, store, AssetStore(store, settings.state_dir / "assets"))
    calls = []

    async def boundary(message, timeout=45):
        calls.append(message)
        if message["operation"] == "validate":
            return {"summary": {"target": "protocol fixture"}}
        if message["operation"] == "reconcile":
            return {"found": False}
        raise TimeoutError("lost response")

    monkeypatch.setattr(service, "invoke", boundary)

    async def scenario():
        plan = await service.validate({"design": {"n_cycles": 1}}, uuid4())
        with pytest.raises(TimeoutError):
            await service.start(plan["id"], plan["digest"])
        recovered = await service.start(plan["id"], plan["digest"], reconcile=True)
        assert recovered["state"] == "validated" and recovered["task_id"] is None
        assert "config_path" not in calls[-1]

    asyncio.run(scenario())


def test_campaign_cannot_bypass_pending_core_work(settings, monkeypatch):
    from opendde_workbench.models import Prediction

    store = Store(settings.state_dir / "jobs.sqlite3")
    service = HarnessService(settings, store, AssetStore(store, settings.state_dir / "assets"))

    async def boundary(message, timeout=45):
        assert message["operation"] == "validate"
        return {"summary": {"target": "protocol fixture"}}

    monkeypatch.setattr(service, "invoke", boundary)

    async def scenario():
        plan = await service.validate({"design": {"n_cycles": 1}}, uuid4())
        store.create(
            Prediction(name="queued", components=[{"kind": "ligand", "value": "CCO"}]),
            str(uuid4()),
            20,
            500,
        )
        with pytest.raises(ConflictError, match="Wait for queued"):
            await service.start(plan["id"], plan["digest"])
        assert service.plan(plan["id"])["state"] == "validated"

    asyncio.run(scenario())
