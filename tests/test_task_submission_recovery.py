"""Recover confirmed mutations independently of current compute availability."""

from uuid import uuid4

from conftest import ProcessEngine, payload


class AvailabilityEngine(ProcessEngine):
    def __init__(self):
        super().__init__("import time; time.sleep(30)")
        self.report = {"ready": True, "gpu": "controlled lifecycle process"}

    async def readiness(self):
        return self.report


def test_confirmed_submission_recovers_offline_but_new_and_changed_requests_do_not(client_factory):
    engine = AvailabilityEngine()
    with client_factory(engine) as client:
        key = {"Idempotency-Key": str(uuid4())}
        first = client.post("/api/jobs", json=payload(), headers=key)
        assert first.status_code == 201
        engine.report["ready"] = False
        assert client.get("/api/health").json()["engine"]["ready"] is False
        recovered = client.post("/api/jobs", json=payload(), headers=key)
        assert recovered.status_code == 201 and recovered.json()["id"] == first.json()["id"]
        changed = client.post("/api/jobs", json={**payload(), "name": "different"}, headers=key)
        assert changed.status_code == 409
        refused = client.post(
            "/api/jobs", json=payload(), headers={"Idempotency-Key": str(uuid4())}
        )
        assert refused.status_code == 503
        assert len(client.get("/api/jobs").json()) == 1
        client.post(f"/api/jobs/{first.json()['id']}/cancel", json={})


def test_confirmed_retry_recovers_offline_and_retains_the_exact_parent(client_factory):
    engine = AvailabilityEngine()
    with client_factory(engine) as client:
        parent = client.post(
            "/api/jobs", json=payload(), headers={"Idempotency-Key": str(uuid4())}
        ).json()
        client.post(f"/api/jobs/{parent['id']}/cancel", json={})
        key = {"Idempotency-Key": str(uuid4())}
        first = client.post(f"/api/jobs/{parent['id']}/retry", json={}, headers=key)
        assert first.status_code == 201
        engine.report["ready"] = False
        recovered = client.post(f"/api/jobs/{parent['id']}/retry", json={}, headers=key)
        assert recovered.status_code == 201 and recovered.json()["id"] == first.json()["id"]
        assert recovered.json()["parent_id"] == parent["id"]
        assert len(client.get("/api/jobs").json()) == 2
        client.post(f"/api/jobs/{first.json()['id']}/cancel", json={})


def test_confirmed_batch_recovers_offline_and_changed_batches_conflict(client_factory):
    engine = AvailabilityEngine()
    with client_factory(engine) as client:
        body = {"tasks": [payload(), {**payload(), "name": "second"}]}
        key = {"Idempotency-Key": str(uuid4())}
        first = client.post("/api/batches", json=body, headers=key)
        assert first.status_code == 201
        engine.report["ready"] = False
        recovered = client.post("/api/batches", json=body, headers=key)
        assert recovered.status_code == 201
        assert [job["id"] for job in recovered.json()] == [job["id"] for job in first.json()]
        changed = client.post("/api/batches", json={"tasks": [payload()]}, headers=key)
        assert changed.status_code == 409
        refused = client.post("/api/batches", json=body, headers={"Idempotency-Key": str(uuid4())})
        assert refused.status_code == 503
        assert len(client.get("/api/jobs").json()) == 2
        for job in first.json():
            client.post(f"/api/jobs/{job['id']}/cancel", json={})
