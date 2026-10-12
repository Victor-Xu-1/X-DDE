"""Small real SQLite/ASGI fixtures; no lifespan, model, or scientific execution."""

import asyncio
import gc
import hashlib
import inspect
import sqlite3
import threading
from contextlib import asynccontextmanager, contextmanager

import httpx2 as httpx
import pytest
from fastapi import FastAPI

from opendde_workbench import asset_routes
from opendde_workbench import assets as asset_module
from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.disk_space import StorageCapacityError, StorageUnavailable
from opendde_workbench.store import Store

URL = "/api/assets?name=fixture.pdb&kind=structure"
CONTENT = b"END\n"


@pytest.fixture
def application(settings):
    app = create_app(settings)
    endpoint = next(
        route.endpoint
        for route in app.routes
        if getattr(route, "path", None) == "/api/assets" and "POST" in route.methods
    )
    return app, inspect.getclosurevars(endpoint).nonlocals["assets"]


@asynccontextmanager
async def client_for(app, *, security=True, raise_errors=True):
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=raise_errors)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        if security:
            session = await client.get("/api/session")
            client.headers["X-Workbench-CSRF"] = session.json()["csrf_token"]
        yield client


async def wait_for(event):
    assert await asyncio.to_thread(event.wait, 5), "Fixture did not reach the expected phase"


def test_real_app_read_finishes_before_contended_upload(application, monkeypatch):
    app, assets = application
    locked, entered, release, watchdog = (threading.Event() for _ in range(4))
    save = assets.save

    def signalled_save(*args):
        entered.set()
        return save(*args)

    monkeypatch.setattr(assets, "save", signalled_save)

    def writer():
        with sqlite3.connect(assets.store.path) as db:
            db.execute("BEGIN IMMEDIATE")
            locked.set()
            if not release.wait(3):
                watchdog.set()  # Fails the old blocking implementation without hanging CI.

    thread = threading.Thread(target=writer)
    thread.start()

    async def scenario():
        async with client_for(app) as client:
            await wait_for(locked)
            upload = asyncio.create_task(client.post(URL, content=CONTENT))
            try:
                await wait_for(entered)
                read = await client.get("/api/session")
                assert read.status_code == 200
                assert not watchdog.is_set(), "Session read waited for the writer watchdog"
                assert not upload.done(), "Session read waited for upload publication"
            finally:
                release.set()
                response = await upload
            assert response.status_code == 201
            assert assets.path(assets.get(response.json()["id"])).read_bytes() == CONTENT

    try:
        asyncio.run(scenario())
    finally:
        release.set()
        thread.join(5)
        assert not thread.is_alive()


def test_uncontended_upload_owns_connection_in_worker_and_retries_exactly(application, monkeypatch):
    app, assets = application
    loop_thread = threading.get_ident()
    connect = assets.store.connect
    threads = []

    @contextmanager
    def tracked_connect():
        threads.append(("open", threading.get_ident()))
        with connect() as db:
            db.set_trace_callback(lambda _: threads.append(("execute", threading.get_ident())))
            yield db
        threads.append(("closed", threading.get_ident()))

    monkeypatch.setattr(assets.store, "connect", tracked_connect)

    async def scenario():
        async with client_for(app) as client:
            first = await client.post(URL, content=CONTENT)
            retry = await client.post(URL, content=CONTENT)
            assert first.status_code == retry.status_code == 201
            assert first.json() == retry.json()
            assert threads and all(identifier != loop_thread for _, identifier in threads)
            assert sum(stage == "open" for stage, _ in threads) == 2
            assert sum(stage == "closed" for stage, _ in threads) == 2
            assert first.json()["sha256"] == hashlib.sha256(CONTENT).hexdigest()
            assert (await client.get("/api/assets/" + first.json()["id"])).content == CONTENT
            assert len((await client.get("/api/assets")).json()) == 1

    asyncio.run(scenario())


@pytest.fixture
def route_app(tmp_path):
    # Exercise the route's two-slot admission independently of the full app's
    # additional mutation serialization. Full security/read behavior is above.
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    app = FastAPI()
    asset_routes.register_assets(app, assets, lambda: None)
    return app, assets


@pytest.fixture
def deadlines(monkeypatch):
    original = asyncio.timeout
    contexts = []

    def controlled_timeout(seconds):
        assert seconds == 90
        deadline = original(seconds)
        contexts.append(deadline)
        return deadline

    monkeypatch.setattr(asset_routes.asyncio, "timeout", controlled_timeout)
    return contexts


@pytest.mark.parametrize("interruption", ["cancel", "timeout"])
@pytest.mark.parametrize("phase", ["capacity", "publish"])
def test_interrupted_worker_retains_bounded_admission_and_same_content_retry(
    route_app, monkeypatch, deadlines, interruption, phase
):
    app, assets = route_app
    entered = [threading.Event(), threading.Event(), threading.Event()]
    release = [threading.Event(), threading.Event()]
    lock = threading.Lock()
    calls = []
    save, capacity = assets.save, asset_routes.require_space

    def gated(*args):
        with lock:
            index = len(calls)
            calls.append(args)
        if index < 3:
            entered[index].set()
        if index < 2:
            assert release[index].wait(5), "Worker fixture was not released"
        return (save if phase == "publish" else capacity)(*args)

    monkeypatch.setattr(
        assets if phase == "publish" else asset_routes,
        "save" if phase == "publish" else "require_space",
        gated,
    )

    async def scenario():
        errors = []
        loop = asyncio.get_running_loop()
        loop.set_exception_handler(lambda _loop, context: errors.append(context))
        async with client_for(app, security=False) as client:
            first = asyncio.create_task(client.post(URL, content=CONTENT))
            second = third = None
            try:
                await wait_for(entered[0])
                second = asyncio.create_task(client.post(URL, content=CONTENT))
                await wait_for(entered[1])
                if interruption == "cancel":
                    first.cancel()
                    with pytest.raises(asyncio.CancelledError):
                        await first
                else:
                    deadlines[0].reschedule(loop.time())
                    response = await first
                    assert response.status_code == 408
                    assert ("saving may still finish" in response.json()["detail"]) == (
                        phase == "publish"
                    )
                third = asyncio.create_task(client.post(URL, content=CONTENT))
                # A queued request can time out promptly, without starting an
                # extra worker or acquiring/releasing another worker's slot.
                while len(deadlines) < 3:
                    await asyncio.sleep(0)
                deadlines[2].reschedule(loop.time())
                queued = await third
                assert queued.status_code == 408
                assert "saving may still finish" not in queued.json()["detail"]
                assert len(calls) == 2 and not entered[2].is_set()
            finally:
                for gate in release:
                    gate.set()
                await asyncio.gather(
                    *(task for task in (first, second, third) if task), return_exceptions=True
                )
            retry = await client.post(URL, content=CONTENT)
            assert retry.status_code == 201
            assert len(assets.list()) == 1
            assert assets.path(assets.get(retry.json()["id"])).read_bytes() == CONTENT
            gc.collect()
            await asyncio.sleep(0)
            assert errors == []
            await assert_admission_recovered(app)

    asyncio.run(scenario())


def test_cancel_queued_request_does_not_release_active_slots(route_app, monkeypatch, deadlines):
    app, assets = route_app
    entered, release = threading.Event(), threading.Event()
    save = assets.save
    calls = []
    lock = threading.Lock()

    def gated_save(*args):
        with lock:
            calls.append(args)
            if len(calls) == 2:
                entered.set()
        assert release.wait(5)
        return save(*args)

    monkeypatch.setattr(assets, "save", gated_save)

    async def scenario():
        async with client_for(app, security=False) as client:
            active = [asyncio.create_task(client.post(URL, content=CONTENT)) for _ in range(2)]
            try:
                await wait_for(entered)
                queued = asyncio.create_task(client.post(URL, content=CONTENT))
                while len(deadlines) < 3:
                    await asyncio.sleep(0)
                queued.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await queued
                another = asyncio.create_task(client.post(URL, content=CONTENT))
                while len(deadlines) < 4:
                    await asyncio.sleep(0)
                deadlines[3].reschedule(asyncio.get_running_loop().time())
                assert (await another).status_code == 408
                assert len(calls) == 2
            finally:
                release.set()
                assert all(
                    response.status_code == 201 for response in await asyncio.gather(*active)
                )
            assert (await client.post(URL, content=CONTENT)).status_code == 201
            assert len(assets.list()) == 1
            await assert_admission_recovered(app)

    asyncio.run(scenario())


@pytest.mark.parametrize("failure", [ValueError("invalid file"), OSError("disk write failed")])
def test_late_publication_error_is_retrieved_and_slot_recovers(
    route_app, monkeypatch, deadlines, failure
):
    app, assets = route_app
    entered, release = threading.Event(), threading.Event()
    save = assets.save

    def fail(*args):
        entered.set()
        assert release.wait(5)
        raise failure

    monkeypatch.setattr(assets, "save", fail)

    async def scenario():
        errors = []
        loop = asyncio.get_running_loop()
        loop.set_exception_handler(lambda _loop, context: errors.append(context))
        async with client_for(app, security=False) as client:
            upload = asyncio.create_task(client.post(URL, content=CONTENT))
            try:
                await wait_for(entered)
                deadlines[0].reschedule(loop.time())
                assert (await upload).status_code == 408
            finally:
                release.set()
            monkeypatch.setattr(assets, "save", save)
            # Three successful retries would stall if an interrupted worker's
            # slot were leaked. Its exception must not escape as an event-loop warning.
            for _ in range(3):
                assert (await client.post(URL, content=CONTENT)).status_code == 201
            gc.collect()
            await asyncio.sleep(0)
            assert errors == []
            await assert_admission_recovered(app)

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "failure,status", [(StorageUnavailable("unknown"), 503), (StorageCapacityError("full"), 507)]
)
@pytest.mark.parametrize("check", [1, 2])
def test_capacity_errors_before_and_after_stream_preserve_status(
    application, monkeypatch, failure, status, check
):
    app, assets = application
    minimums = []

    def capacity(_path, minimum):
        minimums.append(minimum)
        if len(minimums) == check:
            raise failure

    monkeypatch.setattr(asset_routes, "require_space", capacity)

    async def scenario():
        async with client_for(app) as client:
            assert (await client.post(URL, content=CONTENT)).status_code == status
        assert minimums == ([0] if check == 1 else [0, len(CONTENT)])
        assert not assets.list() and {p.name for p in assets.root.iterdir()} == {".uploads"}

    asyncio.run(scenario())


@pytest.mark.parametrize("content", [b"", b"\x00", b"\xff"])
def test_validation_still_returns_422_without_publication(application, content):
    app, assets = application

    async def scenario():
        async with client_for(app) as client:
            assert (await client.post(URL, content=content)).status_code == 422
        assert not assets.list() and {p.name for p in assets.root.iterdir()} == {".uploads"}

    asyncio.run(scenario())


def test_streamed_limit_and_security_reject_before_publication(application):
    app, assets = application

    async def chunks():
        chunk = b"x" * 1024**2
        for _ in range(25):
            yield chunk
        yield b"x"

    async def scenario():
        async with client_for(app) as client:
            assert (
                await client.post(
                    URL, content=chunks(), headers={"Content-Length": str(25 * 1024**2)}
                )
            ).status_code == 413
            assert (
                await client.post(URL, content=CONTENT, headers={"X-Workbench-CSRF": "wrong"})
            ).status_code == 403
            assert (
                await client.post(URL, content=CONTENT, headers={"Origin": "https://example.org"})
            ).status_code == 403
        assert not assets.list() and {p.name for p in assets.root.iterdir()} == {".uploads"}

    asyncio.run(scenario())


def test_save_failure_rolls_back_file_and_sqlite_then_retry_recovers(application, monkeypatch):
    app, assets = application
    fsync = asset_module.os.fsync

    def fail(_fd):
        raise OSError("controlled fsync failure")

    monkeypatch.setattr(asset_module.os, "fsync", fail)

    async def scenario():
        async with client_for(app, raise_errors=False) as client:
            assert (await client.post(URL, content=CONTENT)).status_code == 500
            assert not assets.list() and {p.name for p in assets.root.iterdir()} == {".uploads"}
            monkeypatch.setattr(asset_module.os, "fsync", fsync)
            assert (await client.post(URL, content=CONTENT)).status_code == 201
            assert len(assets.list()) == 1
            await assert_admission_recovered(app)

    asyncio.run(scenario())


@pytest.mark.parametrize("interruption", ["cancel", "timeout"])
def test_stream_interruption_never_starts_publication_and_recovers_slot(
    route_app, deadlines, interruption
):
    app, assets = route_app

    async def scenario():
        streaming = asyncio.Event()
        continued = []

        async def content():
            yield b"E"
            streaming.set()
            await asyncio.Event().wait()
            continued.append(True)
            yield b"ND\n"

        async with client_for(app, security=False) as client:
            upload = asyncio.create_task(client.post(URL, content=content()))
            await streaming.wait()
            if interruption == "cancel":
                upload.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await upload
            else:
                deadlines[0].reschedule(asyncio.get_running_loop().time())
                response = await upload
                assert response.status_code == 408
                assert "saving may still finish" not in response.json()["detail"]
            assert not assets.list() and not list(assets.root.iterdir()) and not continued
            assert (await client.post(URL, content=CONTENT)).status_code == 201
            await assert_admission_recovered(app)

    asyncio.run(scenario())


def test_event_loop_shutdown_waits_for_owned_publication(route_app, monkeypatch):
    app, assets = route_app
    entered, main_returning, completed = (threading.Event() for _ in range(3))
    save = assets.save

    def gated_save(*args):
        entered.set()
        assert main_returning.wait(5)
        result = save(*args)
        completed.set()
        return result

    monkeypatch.setattr(assets, "save", gated_save)

    async def scenario():
        async with client_for(app, security=False) as client:
            upload = asyncio.create_task(client.post(URL, content=CONTENT))
            await wait_for(entered)
            upload.cancel()
            with pytest.raises(asyncio.CancelledError):
                await upload
            assert not completed.is_set()
        main_returning.set()
        # Return with the actual executor worker still owned. asyncio.run's
        # normal executor shutdown must not cancel its publication Future.

    try:
        asyncio.run(scenario())
    finally:
        main_returning.set()
    assert completed.is_set()
    assert len(assets.list()) == 1
    assert assets.path(assets.list()[0]).read_bytes() == CONTENT


async def assert_admission_recovered(app):
    endpoint = next(
        route.endpoint
        for route in app.routes
        if getattr(route, "path", None) == "/api/assets" and "POST" in route.methods
    )
    state = inspect.getclosurevars(endpoint).nonlocals
    # Await genuinely owned executor futures, then their done callbacks. The
    # white-box assertion complements the externally checked third-request gate.
    await asyncio.gather(*tuple(state["pending"]), return_exceptions=True)
    await asyncio.sleep(0)
    assert not state["pending"] and state["uploads"]._value == 2


def test_uvicorn_sigterm_drains_expired_publication_before_lifespan_exit(tmp_path):
    import signal
    import subprocess
    import sys

    source = inspect.getsource(_uvicorn_signal_child)
    result = subprocess.run(
        [sys.executable, "-c", source + "\n_uvicorn_signal_child()", str(tmp_path)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == -signal.SIGTERM, result.stdout + result.stderr
    assert (tmp_path / "stop_accepted").read_text() == "200"
    assert (tmp_path / "drain_started").is_file()
    assert (tmp_path / "worker_resumed").is_file()
    with sqlite3.connect(tmp_path / "state/jobs.sqlite3") as db:
        row = db.execute("SELECT id,sha256 FROM assets").fetchone()
        assert row and row[1] == hashlib.sha256(CONTENT).hexdigest()
        assert db.execute("SELECT count(*) FROM assets").fetchone()[0] == 1
    assert (tmp_path / "state/assets" / row[0] / "content.pdb").read_bytes() == CONTENT
    assert len(list(tmp_path.glob("state/assets/*/content.pdb"))) == 1


def _uvicorn_signal_child():
    """Actual app/lifespan/signal wrapper; replace only sockets and model bootstrap."""
    import asyncio
    import inspect
    import os
    import signal
    import sys
    import threading
    from pathlib import Path

    import httpx2 as httpx
    import uvicorn

    from opendde_workbench import api, asset_routes
    from opendde_workbench import assets as asset_module
    from opendde_workbench.settings import Settings

    root = Path(sys.argv[1])
    entered, release = threading.Event(), threading.Event()
    register = api.register_assets

    def observed_register(*args):
        close = register(*args)

        async def observed_close():
            (root / "drain_started").touch()
            release.set()  # Only the real lifespan drain releases publication.
            await close()

        return observed_close

    api.register_assets = observed_register
    app = api.create_app(
        Settings(
            state_dir=root / "state",
            image_file=root / "image",
            code_file=root / "code",
            model_dir=root / "models",
            cache_dir=root / "cache",
            minimum_free_bytes=0,
        )
    )
    owners = inspect.getclosurevars(app.router.lifespan_context.__wrapped__).nonlocals

    async def idle():
        pass

    # Retain the real app lifespan and worker lock without model installation,
    # external processes or background scientific tasks in this small fixture.
    owners["deployments"].compute.ensure = lambda: None
    owners["deployments"].start = owners["deployments"].close = idle
    owners["worker"].start = owners["worker"].close = idle
    fsync = asset_module.os.fsync

    def held_fsync(fd):
        fsync(fd)
        entered.set()
        assert release.wait(5), "Lifespan did not drain the owned publication"
        (root / "worker_resumed").touch()

    asset_module.os.fsync = held_fsync
    timeout = asyncio.timeout
    contexts = []

    def observed_timeout(seconds):
        context = timeout(seconds)
        if seconds == 90:
            contexts.append(context)
        return context

    asset_routes.asyncio.timeout = observed_timeout
    server = uvicorn.Server(uvicorn.Config(app))

    async def serve_without_sockets(sockets=None):
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://localhost"
            ) as client:
                client.headers["X-Workbench-CSRF"] = (await client.get("/api/session")).json()[
                    "csrf_token"
                ]
                upload = asyncio.create_task(
                    client.post("/api/assets?name=fixture.pdb&kind=structure", content=b"END\n")
                )
                assert await asyncio.to_thread(entered.wait, 2)
                contexts[0].reschedule(asyncio.get_running_loop().time())
                response = await upload
                assert response.status_code == 408, response.text
                stop = await client.post("/api/lifecycle/stop", content=b"{}")
                assert stop.status_code == 200, stop.text
                (root / "stop_accepted").write_text(str(stop.status_code))
                # Same signal as service_control.stop, only to this owned child.
                # Uvicorn replays it after the real app lifespan has finished.
                os.kill(os.getpid(), signal.SIGTERM)
                await asyncio.sleep(0)

    server._serve = serve_without_sockets
    server.run()
