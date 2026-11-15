"""Local tool discovery must never install or start a recognition process."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from opendde_workbench.backend_router import BackendRouter
from opendde_workbench.deployment.compute_service import ComputeService
from opendde_workbench.runtime_controls import RuntimeControls, register_runtime_controls
from opendde_workbench.store import Store
from opendde_workbench.utility_routes import recognition_available


def test_discovery_only_reads_fixed_bounded_frontend_health():
    response = Mock()
    response.read.return_value = b'{"app":"decimer-workbench"}'
    opener = Mock()
    opener.open.return_value.__enter__ = Mock(return_value=response)
    opener.open.return_value.__exit__ = Mock(return_value=False)
    with patch("urllib.request.build_opener", return_value=opener):
        assert recognition_available()
    opener.open.assert_called_once_with("http://127.0.0.1:8940/health", timeout=2)
    response.read.assert_called_once_with(4097)


def test_discovery_failure_is_not_model_readiness():
    with patch("urllib.request.build_opener") as build:
        build.return_value.open.side_effect = OSError("offline")
        assert recognition_available() is False


def test_platform_boot_never_starts_saved_automatic_compute(tmp_path):
    service = ComputeService(tmp_path)
    service.snapshot = Mock(return_value={"running": False})
    service.invoke = Mock(side_effect=AssertionError("Unexpected model start"))
    assert service.ensure() == {"running": False}
    service.invoke.assert_not_called()


def test_managed_engine_default_off_explicit_enable_and_restart_reset(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    app, engine = FastAPI(), object.__new__(BackendRouter)
    prior_gate = AsyncMock(return_value=None)
    worker = SimpleNamespace(gate=prior_gate)
    health = AsyncMock(return_value={"engine": {"backends": {"chemistry": {"ready": True}}}})
    register_runtime_controls(app, store, engine, worker, health, lambda: None)
    job = SimpleNamespace(request=SimpleNamespace(operation="properties"))
    with TestClient(app) as client:
        assert all(
            not item["enabled"] for item in client.get("/api/runtime-controls").json()["engines"]
        )
        assert asyncio.run(worker.gate(job))
        prior_gate.assert_not_called()
        assert client.post("/api/runtime-controls/admet/start", json={}).status_code == 409
        assert client.post("/api/runtime-controls/chemistry/start", json={}).status_code == 200
        assert asyncio.run(worker.gate(job)) is None
        prior_gate.assert_awaited_once()
        assert engine.admission(job) is None
        assert client.post("/api/runtime-controls/chemistry/stop", json={}).status_code == 200
        assert engine.admission(job)
    fresh = RuntimeControls(store)
    assert fresh.reason(job)


def test_active_or_paused_lifetime_cannot_be_disabled(tmp_path):
    controls = RuntimeControls(Store(tmp_path / "jobs.sqlite3"))
    controls.change("chemistry", "start", True)
    with patch.object(controls, "active_engines", return_value={"chemistry"}):
        with pytest.raises(HTTPException) as error:
            controls.change("chemistry", "stop", False)
    assert error.value.status_code == 409
    assert "chemistry" in controls.enabled
