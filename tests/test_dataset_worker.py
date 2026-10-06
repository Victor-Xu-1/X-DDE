"""Large inputs never consume output budgets, and cancellation can interrupt preparation."""

import asyncio
from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.datasets.contract import DatasetTask
from opendde_workbench.models import Status
from opendde_workbench.prediction import Prediction
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store
from opendde_workbench.worker import Worker


@pytest.mark.parametrize(
    "dataset,large_output,expected",
    [(True, False, "succeeded"), (True, True, "failed"), (False, False, "failed")],
)
def test_output_budget_preserves_large_dataset_inputs_and_legacy_limits(
    tmp_path, monkeypatch, dataset, large_output, expected
):
    from opendde_workbench import worker as module

    settings = replace(Settings.from_env(), state_dir=tmp_path)
    store = Store(tmp_path / "jobs.sqlite3")
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    task = (
        DatasetTask(
            operation="library_prepare",
            name="Large data budget",
            inputs=[{"role": "data", "source": ref}],
            scientific_inputs=[ref],
            payload={"kind": "chemistry"},
            output_bytes=1024**3,
        )
        if dataset
        else Prediction(name="Legacy task", components=[{"kind": "protein", "sequence": "AAAA"}])
    )
    job = store.create(task, str(uuid4()), 10, 100)
    job = store.claim(job.id)
    process = SimpleNamespace(returncode=None, stdout=None)

    async def wait():
        return 0

    process.wait = wait

    class Engine:
        async def start(self, job, directory):
            stream = asyncio.StreamReader()
            stream.feed_eof()
            process.stdout = stream
            return process

        async def stop(self, job_id):
            process.returncode = 0

    def prepare(job, directory, assets):
        (directory / "assets").mkdir()
        (directory / "output").mkdir()
        with (directory / "assets/large.csv").open("wb") as file:
            file.truncate(2 * 1024**3)
        if large_output:
            with (directory / "output/oversized.sqlite").open("wb") as file:
                file.truncate(2 * 1024**3)

    monkeypatch.setattr(module, "prepare", prepare)
    monkeypatch.setattr(module, "successful", lambda *args: True)
    monkeypatch.setattr(
        "opendde_workbench.research.constraint_records.ConstraintRecords.check_task",
        lambda *args: None,
    )
    worker = Worker(store, Engine(), settings)
    monkeypatch.setattr(worker.outputs, "index", lambda *args: {"count": 0, "errors": []})
    calls = 0

    async def progress():
        nonlocal calls
        calls += 1
        if calls == 2:
            process.returncode = 0

    worker.on_progress = progress
    asyncio.run(worker.execute(job))
    final = store.get(job.id)
    assert final.status == expected
    if expected == "failed":
        assert "storage budget" in final.error


def test_cancellation_during_verified_source_preparation_does_not_start_native_computation(
    tmp_path, monkeypatch
):
    from opendde_workbench import worker as module

    settings = replace(Settings.from_env(), state_dir=tmp_path)
    store = Store(tmp_path / "jobs.sqlite3")
    ref = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    request = DatasetTask(
        operation="library_prepare",
        name="Cancel preparation",
        inputs=[{"role": "data", "source": ref}],
        scientific_inputs=[ref],
        payload={"kind": "chemistry"},
    )
    job = store.create(request, str(uuid4()), 10, 100)
    job = store.claim(job.id)
    started = []

    class Engine:
        async def start(self, job, directory):
            started.append(job.id)
            raise AssertionError("Scientific process must not start after confirmed cancellation.")

        async def stop(self, job_id):
            pass

    def prepare(job, directory, assets):
        store.cancel(job.id)

    monkeypatch.setattr(module, "prepare", prepare)
    monkeypatch.setattr(
        "opendde_workbench.research.constraint_records.ConstraintRecords.check_task",
        lambda *args: None,
    )
    asyncio.run(Worker(store, Engine(), settings).execute(job))
    assert not started
    assert store.get(job.id).status == Status.CANCELLED
