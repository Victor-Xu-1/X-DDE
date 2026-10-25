"""Refuse unverified managed services before native jobs or campaign dispatch."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench import harness_admission as admission
from opendde_workbench import harness_process
from opendde_workbench.assets import AssetStore
from opendde_workbench.harness_service import HarnessService
from opendde_workbench.store import Store

IDENTIFIER = "a" * 64


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def managed(monkeypatch):
    connection = SimpleNamespace(container_id=IDENTIFIER)
    value = {
        "ready": True,
        "resource_limits_verified": True,
        "container_id": IDENTIFIER,
        "resource_limits": {"cpus": 2, "memory_mib": 4096, "pids": 256},
    }
    monkeypatch.setattr(admission, "read_connection", lambda state: connection)
    monkeypatch.setattr(
        admission,
        "ComputeService",
        lambda *args, **kwargs: SimpleNamespace(snapshot=lambda: dict(value)),
    )
    return value


@pytest.mark.anyio
@pytest.mark.parametrize(
    "change",
    [
        {"ready": False},
        {"resource_limits_verified": False},
        {"container_id": "b" * 64},
        {"resource_limits": {"cpus": 2, "memory_mib": 0, "pids": 256}},
    ],
)
async def test_unavailable_unbounded_or_changed_service_cannot_dispatch(settings, managed, change):
    managed.update(change)
    with pytest.raises(RuntimeError, match="hard resource limits"):
        await admission.require_managed_compute(settings)


@pytest.mark.anyio
async def test_verified_proof_contains_no_private_connection(settings, managed):
    proof = await admission.require_managed_compute(settings)
    assert proof == {
        "container_id": IDENTIFIER,
        "resource_limits": managed["resource_limits"],
        "verification": "owned_docker_host_config_before_native_handoff",
    }


@pytest.mark.anyio
async def test_explicit_remote_configuration_does_not_adopt_a_local_container(
    settings, monkeypatch
):
    monkeypatch.setattr(admission, "read_connection", lambda state: None)
    monkeypatch.setattr(
        admission,
        "ComputeService",
        lambda *args, **kwargs: pytest.fail("Remote service lifecycle must stay external."),
    )
    assert await admission.require_managed_compute(settings) is None


@pytest.mark.anyio
async def test_local_population_comparison_needs_no_native_service(settings, managed, tmp_path):
    managed["ready"] = False
    request = tmp_path / "request.json"
    request.write_text(json.dumps({"operation": "harness", "tool": "compare"}))
    assert await admission.require_managed_compute(settings, request_path=request) is None


@pytest.mark.anyio
async def test_failed_admission_never_launches_the_harness_process(
    settings, managed, tmp_path, monkeypatch
):
    import sys
    from dataclasses import replace

    settings = replace(settings, harness_python=Path(sys.executable))
    managed["resource_limits_verified"] = False
    (tmp_path / "request.json").write_text(json.dumps({"operation": "harness", "tool": "fold"}))
    monkeypatch.setattr(
        asyncio,
        "create_subprocess_exec",
        lambda *args, **kwargs: pytest.fail("No scientific handoff allowed."),
    )
    with pytest.raises(RuntimeError, match="hard resource limits"):
        await harness_process.start(settings, tmp_path)
    assert not (tmp_path / "process.json").exists()


def test_campaign_admission_failure_preserves_reviewable_validated_state(
    settings, managed, monkeypatch
):
    store = Store(settings.state_dir / "jobs.sqlite3")
    service = HarnessService(settings, store, AssetStore(store, settings.state_dir / "assets"))
    calls = []

    async def invoke(message, timeout=45):
        calls.append(message["operation"])
        assert message["operation"] == "validate"
        return {"summary": {"purpose": "resource contract fixture"}}

    monkeypatch.setattr(service, "invoke", invoke)

    async def scenario():
        plan = await service.validate({"design": {"n_cycles": 1}}, uuid4())
        managed["resource_limits_verified"] = False
        with pytest.raises(RuntimeError, match="hard resource limits"):
            await service.start(plan["id"], plan["digest"])
        assert service.plan(plan["id"])["state"] == "validated"
        assert service.plan(plan["id"])["task_id"] is None
        assert calls == ["validate"]
        with store.connect() as db:
            db.execute(
                "UPDATE design_plans SET state='started',task_id='existing-native' WHERE id=?",
                (plan["id"],),
            )
        assert (await service.start(plan["id"], plan["digest"]))["task_id"] == "existing-native"
        assert calls == ["validate"]

    asyncio.run(scenario())
