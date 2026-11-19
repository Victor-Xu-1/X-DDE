"""Local tool discovery must never install or start a recognition process."""

import asyncio
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import httpx2 as httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from opendde_workbench import api, utility_routes
from opendde_workbench.backend_router import BackendRouter
from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.deployment.compute_service import ComputeService
from opendde_workbench.discovery import routes
from opendde_workbench.engine_registry import engine_for
from opendde_workbench.harness_service import HarnessService
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.runtime_controls import RuntimeControls, register_runtime_controls
from opendde_workbench.store import ConflictError, Store
from opendde_workbench.utility_routes import recognition_available, register_utilities


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


@pytest.mark.parametrize(
    ("health", "state", "expected"),
    [
        ({"app": "decimer-workbench"}, {"phase": "stopped", "enabled": False},
         {"available": True, "power": {"phase": "stopped", "enabled": False}}),
        ({"app": "decimer-workbench"}, {"phase": "busy", "enabled": True, "job": "private"},
         {"available": True, "power": {"phase": "busy", "enabled": True}}),
        ({"app": "decimer-workbench"}, {"phase": "stopped", "enabled": "false"},
         {"available": True}),
        ({"app": "decimer-workbench"}, {"phase": ["stopped"], "enabled": False},
         {"available": True}),
        ({"app": "another-service"}, {}, {"available": False}),
    ],
)
def test_recognition_status_only_reads_bounded_native_power(health, state, expected):
    app = FastAPI()
    register_utilities(app)
    opener = Mock()
    for_route = {"health": health, "api/state": state}

    def response(url, *, timeout):
        assert timeout == 2
        path = url.removeprefix("http://127.0.0.1:8940/")
        result = Mock()
        result.read.return_value = json.dumps(for_route[path]).encode()
        stream = Mock()
        stream.__enter__ = Mock(return_value=result)
        stream.__exit__ = Mock(return_value=False)
        return stream

    opener.open.side_effect = response
    with patch("urllib.request.build_opener", return_value=opener), TestClient(app) as client:
        legacy = client.get("/api/utilities/recognition").json()
        assert legacy == {"available": expected["available"], "port": 8940}
        assert opener.open.call_count == 1
        found = client.get("/api/utilities/recognition?include_power=true").json()
    assert found == {"port": 8940, **expected}
    assert opener.open.call_count == (3 if found["available"] else 2)


def test_recognition_power_relays_only_explicit_authorized_actions(monkeypatch):
    state = {"phase": "stopped", "enabled": False}
    token = "a" * 64
    native_calls = []
    idle_power = False
    accepting = False

    class Companion(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send_json(self, status, data, session=False):
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            if session:
                self.send_header("Set-Cookie", f"dw-session={token}; HttpOnly; Path=/")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def do_GET(self):
            native_calls.append(("GET", self.path))
            if self.path == "/health":
                self.send_json(200, {"app": "decimer-workbench", "idlePower": idle_power})
            elif self.path == "/api/state":
                self.send_json(200, state)
            else:
                self.send_json(200, {**state, "csrf": token}, session=True)

        def do_POST(self):
            native_calls.append(("POST", self.path))
            if (
                self.path != "/api/power/idle"
                or self.headers.get("Cookie") != f"dw-session={token}"
                or self.headers.get("X-CSRF-Token") != token
            ):
                self.send_json(403, {})
                return
            if accepting:
                self.send_json(409, {})
                return
            data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            state.update(enabled=data["enabled"], phase="ready" if data["enabled"] else "stopped")
            self.send_json(202, {**state, "job": "private"})

    def authenticate():
        raise HTTPException(403, "Test authentication")

    app = FastAPI()
    register_utilities(app)
    utility_routes.register_recognition_power(app, authenticate)
    route = "/api/utilities/recognition"
    with ThreadingHTTPServer(("127.0.0.1", 0), Companion) as native:
        thread = Thread(target=native.serve_forever, daemon=True)
        thread.start()
        monkeypatch.setattr(utility_routes, "_RECOGNITION_URL", f"http://127.0.0.1:{native.server_port}/")
        try:
            with TestClient(app) as client:
                assert client.post(f"{route}/start").status_code == 403
                assert native_calls == []
                app.dependency_overrides[authenticate] = lambda: None
                assert client.post(f"{route}/reset").status_code == 404
                assert native_calls == []
                assert client.get(route, params={"include_power": True}).json()["power"] == state
                assert native_calls == [("GET", "/health"), ("GET", "/api/state")]
                assert client.post(f"{route}/start").status_code == 409
                assert ("GET", "/api/session") not in native_calls
                idle_power = True
                on = client.post(f"{route}/start")
                assert on.status_code == 200
                assert on.json() == {
                    "available": True, "port": 8940, "idle_power": True, "power": state,
                }
                assert on.json()["power"]["enabled"] is True
                state.update(phase="busy")
                assert client.post(f"{route}/stop").status_code == 409
                assert native_calls.count(("POST", "/api/power/idle")) == 1
                state.update(phase="ready")
                accepting = True
                assert client.post(f"{route}/stop").status_code == 409
                assert state == {"phase": "ready", "enabled": True}
                accepting = False
                off = client.post(f"{route}/stop")
                assert off.status_code == 200
                assert off.json()["power"] == {"phase": "stopped", "enabled": False}
                assert native_calls.count(("POST", "/api/power/idle")) == 3
        finally:
            native.shutdown()
            thread.join(timeout=3)


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
        snapshot = client.get("/api/runtime-controls").json()
        assert all(not item["enabled"] for item in snapshot["engines"])
        assert snapshot["capabilities"]["admet.brain"] == "admet"
        assert snapshot["capabilities"]["gnina.minimize"] == "gnina"
        assert snapshot["capabilities"]["campaign"] == "harness"
        assert snapshot["capabilities"]["regions"] == engine_for("diffsbdd").id
        assert snapshot["capabilities"]["pose_exploration"] == engine_for("docking").id
        assert "experimental.evidence" not in snapshot["capabilities"]
        assert "workflows" not in snapshot["capabilities"]
        engines = {row["id"]: row for row in snapshot["engines"]}
        for capability in CAPABILITIES.values():
            if capability.environment == "platform":
                continue
            assert snapshot["capabilities"][capability.id] == capability.environment
            for operation in capability.operations:
                owner = engine_for(operation).id
                assert owner == capability.environment
                assert operation in engines[owner]["operations"]
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


def test_lookup_shares_engine_permission_and_active_lifetime(tmp_path, monkeypatch):
    app, engine = FastAPI(), object.__new__(BackendRouter)
    store = Store(tmp_path / "jobs.sqlite3")
    health = AsyncMock(return_value={"engine": {"backends": {"discovery": {"ready": True}}}})
    worker = SimpleNamespace(gate=None)
    register_runtime_controls(app, store, engine, worker, health, lambda: None)
    routes.register_discovery(app, lambda: None)
    entered, release = Event(), Event()

    def lookup(entity, text):
        assert (entity, text) == ("target", "query")
        entered.set()
        assert release.wait(5)
        return {"hits": []}

    mocked = Mock(side_effect=lookup)
    monkeypatch.setattr(routes, "lookup", mocked)
    payload = {"query": "query", "entity": "target", "allow_external": True}
    endpoint = "/api/discovery/lookup"
    switch = "/api/runtime-controls/discovery/"

    async def scenario():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            assert (await client.post(endpoint, json=payload)).status_code == 409
            mocked.assert_not_called()
            assert (await client.post(switch + "start", json={})).json() == {"enabled": True}
            pending = asyncio.create_task(client.post(endpoint, json=payload))
            try:
                assert await asyncio.to_thread(entered.wait, 5)
                engines = (await client.get("/api/runtime-controls?include_native=false")).json()
                assert next(e for e in engines["engines"] if e["id"] == "discovery")["active"]
                assert (await client.post(switch + "stop", json={})).status_code == 409
            finally:
                release.set()
                completed = await pending
            assert completed.json() == {"hits": []}
            assert (await client.post(switch + "stop", json={})).json() == {"enabled": False}
            assert (await client.post(endpoint, json=payload)).status_code == 409
            mocked.assert_called_once()

    asyncio.run(scenario())


def test_disabled_queue_head_does_not_starve_enabled_engine(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    first = store.create(
        TASK_ADAPTER.validate_python(
            {
                "operation": "doctor",
                "name": "Disabled backend diagnostic",
            }
        ),
        str(uuid4()),
        20,
        100,
    )
    next_job = store.create(
        TASK_ADAPTER.validate_python(
            {
                "operation": "properties",
                "name": "Queue fairness",
                "smiles": ["CC(=O)Oc1ccccc1C(=O)O"],
            }
        ),
        str(uuid4()),
        20,
        100,
    )
    controls = RuntimeControls(store)
    assert controls.next_queued() is None
    controls.change("chemistry", "start", True)
    assert controls.next_queued().id == next_job.id
    assert store.claim(controls.next_queued().id).id == next_job.id
    assert store.get(first.id).status == "queued"
    assert store.claim(next_job.id) is None
    store.cancel(first.id)
    assert store.claim(first.id) is None


def test_switch_off_during_native_probe_leaves_task_queued(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    engine, worker = object.__new__(BackendRouter), SimpleNamespace(gate=None)
    controls = None

    async def probe(job):
        controls.change("chemistry", "stop", False)
        return None

    worker.gate = probe
    controls = register_runtime_controls(
        FastAPI(), store, engine, worker, AsyncMock(), lambda: None
    )
    controls.change("chemistry", "start", True)
    job = SimpleNamespace(request=SimpleNamespace(operation="properties"))
    assert asyncio.run(worker.gate(job))


def test_harness_direct_launch_obeys_switch_and_native_activity(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    service = object.__new__(HarnessService)
    service.runtime_busy = AsyncMock(return_value=False)
    service.invoke = AsyncMock(side_effect=AssertionError("Unexpected native launch"))
    app, worker = FastAPI(), SimpleNamespace(gate=None)
    engine = object.__new__(BackendRouter)
    health = AsyncMock(return_value={"engine": {"backends": {"harness": {"ready": True}}}})
    register_runtime_controls(app, store, engine, worker, health, lambda: None, service)
    with pytest.raises(ConflictError, match="Enable OpenDDE Harness"):
        asyncio.run(service.start(uuid4(), "digest"))
    service.invoke.assert_not_called()
    with TestClient(app) as client:
        assert client.post("/api/runtime-controls/harness/start", json={}).status_code == 200
        service.runtime_busy.return_value = True
        assert client.post("/api/runtime-controls/harness/stop", json={}).status_code == 409
        service.runtime_busy.return_value = False
        assert client.post("/api/runtime-controls/harness/stop", json={}).status_code == 200


def test_failed_native_probe_keeps_independent_controls_available(tmp_path):
    app, store = FastAPI(), Store(tmp_path / "jobs.sqlite3")
    engine, worker = object.__new__(BackendRouter), SimpleNamespace(gate=None)
    harness = SimpleNamespace(runtime_busy=AsyncMock(side_effect=RuntimeError("offline")))
    health = AsyncMock(return_value={"engine": {"backends": {"chemistry": {"ready": True}}}})
    register_runtime_controls(app, store, engine, worker, health, lambda: None, harness)
    with TestClient(app) as client:
        lightweight = client.get("/api/runtime-controls?include_native=false")
        assert lightweight.status_code == 200
        harness.runtime_busy.assert_not_awaited()
        reply = client.get("/api/runtime-controls")
        assert reply.status_code == 200
        rows = {item["id"]: item for item in reply.json()["engines"]}
        assert rows["harness"]["activity_unknown"]
        assert rows["chemistry"]["ready"] and not rows["chemistry"]["activity_unknown"]
        assert client.post("/api/runtime-controls/chemistry/start", json={}).status_code == 200
        assert client.post("/api/runtime-controls/harness/stop", json={}).status_code == 409


def test_harness_stop_serializes_with_campaign_start(settings, monkeypatch):
    """The real app mutation lock spans the idle probe and admission update."""
    base = "http://127.0.0.1:4320"
    start_path = f"/api/harness/plans/{uuid4()}/start"
    monkeypatch.setattr(
        BackendRouter,
        "readiness",
        AsyncMock(return_value={"backends": {"harness": {"ready": True}}}),
    )

    async def scenario():
        probing, released, waiting = asyncio.Event(), asyncio.Event(), asyncio.Event()

        class ObservedLock(asyncio.Lock):
            async def acquire(self):
                if self.locked():
                    waiting.set()
                return await super().acquire()

        async def idle(_service):
            probing.set()
            await asyncio.wait_for(released.wait(), 5)
            return False

        monkeypatch.setattr(HarnessService, "runtime_busy", idle)
        launch = Mock(side_effect=AssertionError("Disabled campaign entered dispatch."))
        monkeypatch.setattr(HarnessService, "plan", launch)
        monkeypatch.setattr(
            api, "asyncio", SimpleNamespace(**(vars(asyncio) | {"Lock": ObservedLock}))
        )
        app = api.create_app(settings)

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url=base
        ) as client:
            token = (await client.get("/api/session")).json()["csrf_token"]
            client.headers.update({"X-Workbench-CSRF": token, "Origin": base})
            start = await client.post("/api/runtime-controls/harness/start", json={})
            assert start.status_code == 200
            stop_task = asyncio.create_task(
                client.post("/api/runtime-controls/harness/stop", json={})
            )
            await asyncio.wait_for(probing.wait(), 5)
            launch_task = asyncio.create_task(client.post(start_path, json={"digest": "a" * 64}))
            try:
                await asyncio.wait_for(waiting.wait(), 5)
            finally:
                released.set()
            stopped, blocked = await asyncio.gather(stop_task, launch_task)
            assert stopped.status_code == 200
            assert blocked.status_code == 409
            assert "Enable OpenDDE Harness" in blocked.json()["detail"]
            launch.assert_not_called()

    asyncio.run(scenario())
