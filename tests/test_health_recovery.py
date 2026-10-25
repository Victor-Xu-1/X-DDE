"""Actual API consumers of a slow shared native observation; no scientific work."""

import asyncio
import threading
import time
from uuid import uuid4

import pytest
from conftest import ProcessEngine, payload

from opendde_workbench import api
from opendde_workbench.readiness_cache import ReadinessCache


@pytest.mark.parametrize("fresh_ready", [False, True])
def test_health_timeout_preserves_api_and_submission_admission(
    client_factory, monkeypatch, fresh_ready
):
    class SlowEngine(ProcessEngine):
        calls = 0
        gate = threading.Event()

        async def readiness(self):
            self.calls += 1
            first = self.calls == 1
            if first:
                while not self.gate.is_set():
                    await asyncio.sleep(0.002)
            return {"ready": True if first else fresh_ready, "gpu": None, "reason": None}

    monkeypatch.setattr(
        api,
        "ReadinessCache",
        lambda observe, **kwargs: ReadinessCache(observe, **kwargs, observation_timeout=0.025),
    )
    engine = SlowEngine()
    with client_factory(engine) as client:
        started = time.monotonic()
        response = client.get("/api/health")
        assert response.status_code == 503 and time.monotonic() - started < 1
        assert response.json() == {
            "detail": "Backend availability could not be confirmed. Retry the availability check."
        }
        assert client.get("/api/health").status_code == 503 and engine.calls == 1
        assert client.get("/api/deployment").status_code == 200
        assert client.get("/api/jobs").json() == []
        submission = client.post(
            "/api/jobs", json=payload(), headers={"Idempotency-Key": str(uuid4())}
        )
        assert submission.status_code == 503
        assert not engine.started and client.get("/api/jobs").json() == []
        engine.gate.set()
        client.portal.call(asyncio.sleep, 0.01)
        restored = client.get("/api/health")
        assert restored.status_code == 200
        assert restored.json()["platform"]["ready"]
        assert restored.json()["engine"]["ready"] is fresh_ready
        assert engine.calls == 2  # A late success cannot become current availability.
