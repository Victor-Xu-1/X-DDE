"""Cache-only preview admission never enqueues; existing computed bytes still open."""

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_stat6_templates import scientific_store

from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.models import Status
from opendde_workbench.research.pose_routes import register_pose_minimization
from opendde_workbench.runtime_controls import RuntimeControls


@pytest.fixture
def preview(tmp_path, settings):
    store, scientific = scientific_store(tmp_path)
    submitted = []

    async def enqueue(task, key):
        submitted.append(task)
        return store.create(task, str(key), 20, 100)

    app = FastAPI()
    app.state.runtime_controls = RuntimeControls(store)
    register_pose_minimization(app, store, scientific.assets, settings, lambda: None, enqueue)
    with TestClient(app) as client:
        yield client, store, scientific, submitted


def send(client, source, **options):
    return client.post(
        "/api/research/poses/initial",
        json={"source": source, **options},
        headers={"Idempotency-Key": str(uuid4())},
    )


@pytest.mark.parametrize("retry_method", [None, "MMFF94s", "UFF"])
def test_cache_only_missing_pose_does_not_enqueue_or_overwrite_input(preview, retry_method):
    client, store, scientific, submitted = preview
    raw = b"protocol fixture\nsource 2D\n\n0 0 V2000\nM  END\n$$$$\n"
    asset = scientific.assets.save("unprepared.sdf", "ligand", raw)
    source = {"kind": "asset", "asset_id": str(asset.id), "record": 0}
    response = send(client, source, allow_compute=False)
    assert response.status_code == 200 and response.json() == {"state": "backend_off"}
    assert submitted == [] and store.list_jobs() == []
    assert scientific.assets.path(asset).read_bytes() == raw
    response = send(client, source)
    assert response.status_code == 200 and response.json() == {"state": "backend_off"}
    assert submitted == [] and store.list_jobs() == []
    client.app.state.runtime_controls.change("chemistry", "start", ready=True)
    response = send(client, source, allow_compute=False)
    assert response.status_code == 503 and "previously calculated poses" in response.text
    assert submitted == [] and store.list_jobs() == []
    response = send(client, source)
    assert response.status_code == 200 and response.json()["state"] == "task"
    assert len(submitted) == 1 and len(store.list_jobs()) == 1
    job_id = response.json()["job"]["id"]
    assert store.claim(job_id)
    if retry_method:
        store.finish(job_id, Status.FAILED, "Fixture failure")
        response = send(client, source, method=retry_method, retry=True)
        new_job_id = response.json()["job"]["id"]
        assert new_job_id != job_id and store.claim(new_job_id)
        job_id = new_job_id
    store.finish(job_id, Status.SUCCEEDED, None)
    client.app.state.runtime_controls.change("chemistry", "stop", ready=False)
    restored = send(client, source, allow_compute=False)
    assert restored.status_code == 200 and restored.json()["job"]["id"] == job_id
    if retry_method == "UFF":
        explicit = send(client, source, method="MMFF94s", retry=True)
        assert explicit.status_code == 200 and explicit.json() == {"state": "backend_off"}
    assert len(submitted) == len(store.list_jobs()) == (2 if retry_method else 1)


@pytest.mark.parametrize("key", ["study_ligand", "study_protac", "calculated_pose"])
def test_cache_only_opens_exact_calculated_stat6_inputs_without_new_tasks(preview, key):
    client, store, scientific, submitted = preview
    prepared = prepare_stat6("gnina.score", scientific)
    reference = prepared.objects[key].reference
    source = {"kind": "version", "version_id": str(reference.version_id)}
    asset = scientific.assets.get(reference.asset_id)
    original = scientific.assets.path(asset).read_bytes()
    response = send(client, source)
    assert response.status_code == 200 and response.json()["state"] == "ready"
    assert response.json()["pose"]["reference"] == reference.model_dump(mode="json")
    assert submitted == [] and store.list_jobs() == []
    assert scientific.assets.path(asset).read_bytes() == original


def test_compute_opt_in_remains_strict_boolean(preview):
    client, _, _, submitted = preview
    response = send(client, {"kind": "asset", "asset_id": str(uuid4())}, allow_compute="false")
    assert response.status_code == 422 and submitted == []
