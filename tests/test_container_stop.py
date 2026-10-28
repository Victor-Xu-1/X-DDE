"""Both owned cleanup boundaries must run; uncertainty must still halt the sole worker."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench import container_runtime, local_process, prepared_container
from opendde_workbench.docking import backend as docking_backend
from opendde_workbench.models import Status
from opendde_workbench.prediction import Prediction
from opendde_workbench.store import Store
from opendde_workbench.worker import Worker

DAEMON = "318e9cd2-c1e9-4ec0-8635-c2d2e12eba39"


@pytest.fixture(params=["preparation", "docking"])
def cancellation(request, tmp_path, monkeypatch):
    directory = tmp_path / str(uuid4())
    runtime = container_runtime.DockerRuntime("unix:///tmp/xdde-test.sock", DAEMON)
    container_runtime.freeze(directory, runtime)
    settings = SimpleNamespace(state_dir=tmp_path / "state")
    if request.param == "preparation":
        module = prepared_container
        backend = module.PreparedContainerBackend(
            settings, "posebusters", tmp_path, ["runner.py"], None, None
        )
        script = tmp_path / "supervise.py"
    else:
        module = docking_backend
        backend = module.DockingBackend(settings)
        script = Path(module.__file__).with_name("supervise.py")
    calls = []
    state = SimpleNamespace(fault=None, local_error=None)

    async def execute(*arguments, **unused):
        calls.append(arguments)
        assert arguments[:3] == ("docker", "--host", runtime.endpoint)
        if arguments[3] == "info":
            observed = "different-daemon" if state.fault == "wrong_daemon" else DAEMON
            return 0, json.dumps(observed)
        assert arguments[3:] == ("rm", "--force", backend.container(directory.name))
        if state.fault == "timeout":
            raise TimeoutError("controlled lost removal reply")
        if state.fault == "cancelled":
            raise asyncio.CancelledError("controlled cancellation during removal")
        if state.fault == "nonzero":
            return 1, "controlled removal failure"
        if state.fault == "missing":
            return 1, "Error response from daemon: No such container: " + arguments[-1]
        return 0, ""

    async def stop_owned(script_path, job_path):
        calls.append(("local_stop", script_path, job_path))
        assert script_path == script and job_path == directory
        if state.local_error:
            raise state.local_error

    monkeypatch.setattr(module, "command", execute)
    monkeypatch.setattr(local_process, "stop", stop_owned)
    return SimpleNamespace(
        backend=backend, directory=directory, calls=calls, state=state, runtime=runtime
    )


@pytest.mark.parametrize(
    "fault,error",
    [
        ("nonzero", RuntimeError),
        ("timeout", TimeoutError),
        ("cancelled", asyncio.CancelledError),
        ("wrong_daemon", RuntimeError),
        ("invalid_receipt", ValueError),
    ],
)
def test_container_failure_still_cleans_the_owned_host_process(cancellation, fault, error):
    context = cancellation
    context.state.fault = fault
    receipt = context.directory / container_runtime.RECEIPT
    if fault == "invalid_receipt":
        receipt.write_text('{"schema":3,"runtime":null}')
    before = receipt.read_bytes()
    with pytest.raises(error):
        asyncio.run(context.backend.stop(context.directory.name, context.directory))
    assert [call[0] for call in context.calls].count("local_stop") == 1
    assert context.calls[-1][0] == "local_stop"
    assert receipt.read_bytes() == before
    if fault in {"wrong_daemon", "invalid_receipt"}:
        assert not any("rm" in call for call in context.calls)


@pytest.mark.parametrize("fault", [None, "missing"])
def test_confirmed_removal_also_requires_local_cleanup(cancellation, fault):
    context = cancellation
    context.state.fault = fault
    asyncio.run(context.backend.stop(context.directory.name, context.directory))
    assert context.calls[-1][0] == "local_stop"
    context.state.local_error = RuntimeError("owned process termination is unconfirmed")
    with pytest.raises(RuntimeError, match="process termination is unconfirmed"):
        asyncio.run(context.backend.stop(context.directory.name, context.directory))


def test_both_failures_remain_in_the_server_exception_chain(cancellation):
    context = cancellation
    context.state.fault = "timeout"
    context.state.local_error = RuntimeError("owned process termination is unconfirmed")
    with pytest.raises(RuntimeError, match="process termination is unconfirmed") as raised:
        asyncio.run(context.backend.stop(context.directory.name, context.directory))
    assert isinstance(raised.value.__context__, TimeoutError)
    assert context.calls[-1][0] == "local_stop"


def test_host_cleanup_cannot_release_worker_halt_while_container_is_unconfirmed(
    cancellation, settings
):
    context = cancellation
    store = Store(settings.state_dir / "jobs.sqlite3")
    task = Prediction(name="Controlled cleanup", components=[{"kind": "protein", "value": "AAAA"}])
    first = store.create(task, str(uuid4()), 10, 100)
    next_job = store.create(task, str(uuid4()), 10, 100)
    first = store.claim(first.id)

    class Engine:
        async def start(self, job, directory):
            store.cancel(job.id)
            raise RuntimeError("controlled cancellation before native start")

        async def stop(self, job_id):
            assert job_id == first.id
            await context.backend.stop(context.directory.name, context.directory)

    context.state.fault = "nonzero"
    worker = Worker(store, Engine(), settings)
    asyncio.run(worker.execute(first))
    assert store.get(first.id).status == Status.FAILED
    assert store.get(next_job.id).status == Status.QUEUED
    assert store.queue_halt()["job_id"] == first.id
    assert context.calls[-1][0] == "local_stop"

    async def recover():
        reopened = Worker(store, Engine(), settings)
        reopened.stopping = True
        await reopened.start()
        await reopened.close()
        return reopened

    still_halted = asyncio.run(recover())
    assert still_halted.error and store.queue_halt()
    context.state.fault = None
    recovered = asyncio.run(recover())
    assert recovered.error is None and store.queue_halt() is None
    assert store.get(first.id).status == Status.FAILED
    assert store.get(next_job.id).status == Status.QUEUED
    assert [call[0] for call in context.calls].count("local_stop") == 3
