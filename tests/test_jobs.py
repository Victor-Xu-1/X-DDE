from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from conftest import ProcessEngine, payload, wait_status

from opendde_workbench.models import Prediction, Status
from opendde_workbench.store import CapacityError, ConflictError, Store


def submit(client, body=None, key=None):
    return client.post(
        "/api/jobs", json=body or payload(), headers={"Idempotency-Key": key or str(uuid4())}
    )


def test_real_process_result_download_and_durable_request(client_factory, settings):
    engine = ProcessEngine()
    with client_factory(engine) as client:
        created = submit(client)
        assert created.status_code == 201
        job_id = created.json()["id"]
        wait_status(client, job_id, {"succeeded"})
        files = client.get(f"/api/jobs/{job_id}/artifacts").json()
        assert files == [{"name": "result.cif", "size": 25}]
        result = client.get(f"/api/jobs/{job_id}/download", params={"name": files[0]["name"]})
        assert result.content == b"controlled-process-output"
        assert "attachment" in result.headers["content-disposition"]
        assert "worker-started" in client.get(f"/api/jobs/{job_id}/logs").json()["text"]
        assert (
            client.get(f"/api/jobs/{job_id}/input").json()[0]["sequences"][0]["ligand"]["ligand"]
            == "CCO"
        )
    assert engine.started == [job_id]
    assert job_id in engine.stopped
    assert Store(settings.state_dir / "jobs.sqlite3").get(job_id).status == Status.SUCCEEDED


def test_parallel_idempotency_is_atomic_and_conflicts_are_rejected(settings):
    store = Store(settings.state_dir / "db.sqlite3")
    prediction = Prediction.model_validate(payload())
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = list(pool.map(lambda _: store.create(prediction, key, 20, 500), range(12)))
    assert len({job.id for job in jobs}) == 1
    prediction.name = "different"
    with pytest.raises(ConflictError):
        store.create(prediction, key, 20, 500)
    with pytest.raises(CapacityError):
        store.create(prediction, str(uuid4()), 1, 500)


def test_running_cancel_stops_process_and_retry_creates_new_task(client_factory):
    engine = ProcessEngine("import time; print('sleeping', flush=True); time.sleep(30)")
    with client_factory(engine) as client:
        job_id = submit(client).json()["id"]
        wait_status(client, job_id, {"running"})
        assert (
            client.post(
                f"/api/jobs/{job_id}/retry", json={}, headers={"Idempotency-Key": str(uuid4())}
            ).status_code
            == 409
        )
        assert client.post(f"/api/jobs/{job_id}/cancel", json={}).status_code == 200
        wait_status(client, job_id, {"cancelled"})
        assert engine.processes[job_id].returncode is not None
        key = str(uuid4())
        response = client.post(
            f"/api/jobs/{job_id}/retry", json={}, headers={"Idempotency-Key": key}
        )
        assert response.status_code == 201
        retried = response.json()
        assert retried["id"] != job_id and retried["parent_id"] == job_id
        duplicate = client.post(
            f"/api/jobs/{job_id}/retry", json={}, headers={"Idempotency-Key": key}
        )
        assert duplicate.json()["id"] == retried["id"]
        client.post(f"/api/jobs/{retried['id']}/cancel", json={})


def test_queued_cancel_does_not_execute(settings):
    store = Store(settings.state_dir / "db.sqlite3")
    job = store.create(Prediction.model_validate(payload()), str(uuid4()), 20, 500)
    assert store.cancel(job.id).status == Status.CANCELLED
    assert store.claim() is None


def test_restart_marks_active_tasks_interrupted(client_factory, settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    job = store.create(Prediction.model_validate(payload()), str(uuid4()), 20, 500)
    store.claim()
    engine = ProcessEngine()
    with client_factory(engine) as client:
        assert client.get(f"/api/jobs/{job.id}").json()["status"] == "interrupted"
        assert engine.started == []
        assert engine.stopped == [job.id]


@pytest.mark.parametrize(
    "script,expected",
    [
        ("import sys; print('engine-failed'); sys.exit(7)", "code 7"),
        ("print('no outputs')", "no successful structure"),
        ("import time; time.sleep(30)", "execution time limit"),
    ],
)
def test_failure_and_timeout_are_reported(client_factory, script, expected):
    with client_factory(ProcessEngine(script), job_timeout=1) as client:
        job_id = submit(client).json()["id"]
        result = wait_status(client, job_id, {"failed"})
        assert expected in result["error"]


def test_large_stdout_is_drained_with_bounded_capture(client_factory, settings):
    with client_factory(ProcessEngine("print('x'*200000)"), log_limit=512) as client:
        job_id = submit(client).json()["id"]
        wait_status(client, job_id, {"failed"})
        log = settings.state_dir / "jobs" / job_id / "run.log"
        assert log.stat().st_size < 1024
        assert "Log capture limit" in log.read_text()


def test_cancellation_cleanup_failure_remains_visible_as_failure(settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    job = store.create(Prediction.model_validate(payload()), str(uuid4()), 20, 500)
    store.claim()
    store.cancel(job.id)
    store.finish(job.id, Status.FAILED, "Remote cancellation could not be confirmed.")
    assert store.get(job.id).status == Status.FAILED
    assert "could not be confirmed" in store.get(job.id).error


def test_configured_compute_token_is_redacted_from_process_logs(client_factory, settings):
    token = "acceptance-token-not-a-real-credential"
    script = "import os; os.write(1,b'x'*16380+b'acceptance-token-not-a-real-credential'+b' end')"
    with client_factory(ProcessEngine(script), harness_token=token) as client:
        job_id = submit(client).json()["id"]
        wait_status(client, job_id, {"failed"})
        log = (settings.state_dir / "jobs" / job_id / "run.log").read_text()
        assert token not in log and "[redacted]" in log
