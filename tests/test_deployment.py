"""Real HTTP, archive, SQLite and process boundaries; never scientific inference."""

import hashlib
import io
import json
import os
import signal
import socket
import subprocess
import sys
import tarfile
import threading
import time
import zipfile
from contextlib import suppress
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import Mock

import pytest

from opendde_workbench import local_process
from opendde_workbench.deployment import process as installer_process
from opendde_workbench.deployment.catalog import dependencies
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.deployment.process import Paused, run
from opendde_workbench.deployment.storage import DeployStore, managed_root
from opendde_workbench.deployment.transfers import download, extract
from opendde_workbench.locations import atomic_json, read_json


def test_location_ownership_and_no_symlinks(tmp_path):
    base = tmp_path / "data"
    root = managed_root(str(base))
    assert root == base / "x-dde-managed"
    assert managed_root(str(base)) == root
    assert read_json(root / ".workbench-owner.json")["owner"] == "X-DDE"
    with pytest.raises(ValueError):
        managed_root("/etc")
    (tmp_path / "other").mkdir()
    (tmp_path / "other/x-dde-managed").symlink_to(root)
    with pytest.raises(ValueError):
        managed_root(str(tmp_path / "other"))


def test_queue_idempotency_dependency_and_uninstall_protection(tmp_path):
    store = DeployStore(tmp_path)
    first = store.enqueue("standard", "install", {})
    assert len(first) == 4
    assert store.enqueue("standard", "install", {}) == first
    assert dependencies("standard") == ["harness", "runtime", "compute", "standard"]
    with pytest.raises(ValueError):
        store.enqueue("harness", "uninstall", {"runtime": {}})


def test_pause_resume_cancel_persists_without_background_work(tmp_path):
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    operation = manager.enqueue("ketcher", "install")[0]
    manager.control(operation, "pause")
    restored = DeploymentManager(tmp_path / "state")
    assert restored.store.get(operation)["state"] == "paused"
    restored.control(operation, "resume")
    assert restored.store.get(operation)["state"] == "queued"
    restored.control(operation, "cancel")
    assert restored.store.get(operation)["state"] == "cancelled"
    with pytest.raises(ValueError):
        restored.control(operation, "resume")


def deployment_record(store, package, state):
    identifier = store.enqueue(package, "install", {})[0]
    store.update(identifier, state=state, stage="Controlled deployment record")
    return identifier


def recent_deployment_history(store, count=100):
    return [deployment_record(store, "molstar", "succeeded") for _ in range(count)]


def test_deployment_rows_retain_latest_unresolved_failures_after_history_and_reopen(tmp_path):
    store = DeployStore(tmp_path)
    failures = {deployment_record(store, package, "failed") for package in ("ketcher", "chemistry")}
    recent = recent_deployment_history(store)
    for current in (store, DeployStore(tmp_path)):
        rows = current.rows()
        assert {row["id"] for row in rows} == failures | set(recent)
        assert len(rows) == 102
        assert rows[:100] == [current.get(identifier) for identifier in reversed(recent)]
        assert all(current.get(identifier)["state"] == "failed" for identifier in failures)


@pytest.mark.parametrize(
    "new_state", ["succeeded", "cancelled", "queued", "running", "pausing", "paused", "failed"]
)
def test_deployment_rows_do_not_resurrect_superseded_failures(tmp_path, new_state):
    store = DeployStore(tmp_path)
    older = deployment_record(store, "ketcher", "failed")
    newer = deployment_record(store, "ketcher", new_state)
    recent = recent_deployment_history(store)
    identifiers = {row["id"] for row in store.rows()}
    expected = set(recent)
    if new_state not in {"succeeded", "cancelled"}:
        expected.add(newer)
    assert identifiers == expected
    assert older not in identifiers
    assert store.get(older)["state"] == "failed"


@pytest.mark.parametrize("state", ["queued", "running", "pausing", "paused"])
def test_deployment_rows_keep_old_active_operations(tmp_path, state):
    store = DeployStore(tmp_path)
    active = deployment_record(store, "ketcher", state)
    recent = recent_deployment_history(store)
    assert {row["id"] for row in store.rows()} == {active, *recent}


def test_deployment_rows_bound_repeated_failed_history(tmp_path):
    store = DeployStore(tmp_path)
    identifiers = [deployment_record(store, "ketcher", "failed") for _ in range(125)]
    assert [row["id"] for row in store.rows()] == list(reversed(identifiers[-100:]))
    assert store.get(identifiers[0])["state"] == "failed"


@pytest.mark.parametrize("new_state", ["succeeded", "failed"])
def test_deployment_rows_order_equal_timestamps_by_insertion(tmp_path, monkeypatch, new_state):
    monkeypatch.setattr("opendde_workbench.deployment.storage.now", lambda: "2026-10-12T00:00:00Z")
    store = DeployStore(tmp_path)
    older = deployment_record(store, "ketcher", "failed")
    newer = deployment_record(store, "ketcher", new_state)
    recent = recent_deployment_history(store)
    rows = store.rows()
    expected = list(reversed(recent)) + ([newer] if new_state == "failed" else [])
    assert [row["id"] for row in rows] == expected
    assert older not in {row["id"] for row in rows}


def test_uninstall_removes_only_owned_package_and_retains_models(tmp_path):
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    root = tmp_path / "components/x-dde-managed"
    directory = root / "packages/ketcher/3.18.0-local"
    directory.mkdir(parents=True)
    (directory / "index.html").write_text("editor")
    (root / "models").mkdir()
    (root / "models/user-model.pt").write_bytes(b"user data")
    atomic_json(root / "installed.json", {"ketcher": {"directory": str(directory)}})
    identifier = manager.enqueue("ketcher", "uninstall")[0]
    manager.tick()
    assert manager.store.get(identifier)["state"] == "succeeded"
    assert not directory.exists()
    assert (root / "models/user-model.pt").read_bytes() == b"user data"


def test_resume_http_integrity_and_bounds(tmp_path):
    payload = b"verified package" * 10000
    offsets = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            offset = int(self.headers.get("Range", "bytes=0-").split("=")[1][:-1])
            offsets.append(offset)
            self.send_response(206 if offset else 200)
            self.send_header("Content-Range", f"bytes {offset}-{len(payload) - 1}/{len(payload)}")
            self.send_header("Content-Length", str(len(payload) - offset))
            self.end_headers()
            self.wfile.write(payload[offset:])

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/package"
    try:
        target = tmp_path / "package.zip"
        target.with_suffix(".zip.part").write_bytes(payload[:300])
        checksum = hashlib.sha256(payload).hexdigest()
        download(url, target, checksum, lambda _: None, lambda: None)
        assert offsets == [300]
        assert target.read_bytes() == payload
        with pytest.raises(ValueError, match="checksum"):
            download(url, tmp_path / "bad", "0" * 64, lambda _: None, lambda: None)
        with pytest.raises(ValueError, match="size limit"):
            download(url, tmp_path / "large", checksum, lambda _: None, lambda: None, limit=30)
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize("name", ["../escape", "/etc/escape", "C:/escape", "a\\escape"])
def test_archive_rejects_traversal(tmp_path, name):
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as stream:
        stream.writestr(name, "bad")
    with pytest.raises(ValueError, match="unsafe"):
        extract(archive, tmp_path / "out", lambda: None)


def test_tar_rejects_links_and_extracts_real_files(tmp_path):
    archive = tmp_path / "real.tgz"
    with tarfile.open(archive, "w:gz") as stream:
        item = tarfile.TarInfo("package/index.html")
        item.size = 4
        stream.addfile(item, io.BytesIO(b"html"))
    extract(archive, tmp_path / "out", lambda: None)
    assert (tmp_path / "out/package/index.html").read_text() == "html"
    with tarfile.open(archive, "w:gz") as stream:
        item = tarfile.TarInfo("link")
        item.type = tarfile.SYMTYPE
        item.linkname = "/etc/passwd"
        stream.addfile(item)
    with pytest.raises(ValueError, match="links"):
        extract(archive, tmp_path / "links", lambda: None)


def test_real_installer_process_can_be_paused(tmp_path):
    def checkpoint():
        raise Paused()

    with pytest.raises(Paused):
        run(
            [sys.executable, "-c", "import time; time.sleep(20)"],
            tmp_path,
            checkpoint,
            lambda _: None,
        )
    assert not (tmp_path / "process.json").exists()


@pytest.fixture
def controlled_installer(tmp_path, monkeypatch):
    """Bound startup regressions, including their failure path, to harmless children."""
    ready = tmp_path / "child.pid"
    command = [
        sys.executable,
        "-c",
        "import signal, subprocess, sys, time; from pathlib import Path; "
        "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)']); "
        "Path(sys.argv[1]).write_text(str(child.pid)); "
        "time.sleep(0 if sys.argv[2] == 'exit' else 30)",
        str(ready),
    ]
    popen = subprocess.Popen
    processes = []
    descendants = []
    threads = []

    def spawn(*args, **kwargs):
        process = popen(*args, **kwargs)
        processes.append(process)
        deadline = time.monotonic() + 5
        while not ready.exists() or not ready.read_text():
            assert time.monotonic() < deadline, "Controlled installer did not start"
            time.sleep(0.01)
        child = int(ready.read_text())
        child_identity = local_process.kernel_identity(child)
        assert child_identity["group"] == process.pid
        descendants.append((child, child_identity))
        if args[0][-1] == "exit":
            while local_process.kernel_identity(process.pid)["state"] != "Z":
                assert time.monotonic() < deadline, "Controlled installer did not exit"
                time.sleep(0.01)
        return process

    monkeypatch.setattr(installer_process.subprocess, "Popen", spawn)

    def exercise(*, leader_exited=False):
        errors = []

        def invoke():
            try:
                run(
                    [*command, "exit" if leader_exited else "wait"],
                    tmp_path,
                    lambda: None,
                    lambda _: None,
                    timeout=0.1,
                )
            except BaseException as error:
                errors.append(error)

        thread = threading.Thread(target=invoke, daemon=True)
        threads.append(thread)
        thread.start()
        thread.join(3)
        assert not thread.is_alive(), "Installer startup failure blocked on a live child"
        assert len(errors) == 1
        assert processes[0].returncode is not None
        deadline = time.monotonic() + 2
        while local_process.group_members(processes[0].pid):
            assert time.monotonic() < deadline, "Installer startup left a live descendant"
            time.sleep(0.01)
        return errors[0]

    try:
        yield exercise
    finally:
        for process in processes:
            # Do not reuse a PID after wait/poll has released the owned child.
            if process.returncode is None:
                with suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        for child, expected in descendants:
            with suppress(ProcessLookupError, FileNotFoundError):
                current = local_process.kernel_identity(child)
                if (
                    current["start_time"] == expected["start_time"]
                    and current["group"] == expected["group"]
                ):
                    os.kill(child, signal.SIGKILL)
        for thread in threads:
            thread.join(5)


@pytest.mark.parametrize("error_type", [OSError, PermissionError, FileNotFoundError])
def test_installer_identity_write_failure_cleans_owned_group(
    controlled_installer, tmp_path, monkeypatch, error_type
):
    error = error_type("controlled identity write failure")
    open_path = Path.open

    def fail_identity_open(path, *args, **kwargs):
        if path.name.startswith(".process.json-"):
            raise error
        return open_path(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fail_identity_open)
    assert controlled_installer() is error
    assert not (tmp_path / "process.json").exists()
    assert not list(tmp_path.glob(".process.json-*.tmp"))


@pytest.mark.parametrize("error_type", [PermissionError, FileNotFoundError, KeyboardInterrupt])
def test_installer_identity_capture_failure_cleans_owned_group(
    controlled_installer, monkeypatch, error_type
):
    error = error_type("controlled identity capture failure")
    monkeypatch.setattr(installer_process, "identity", Mock(side_effect=error))
    assert controlled_installer() is error


def test_installer_startup_failure_cleans_group_after_leader_exit(
    controlled_installer, monkeypatch
):
    error = OSError("controlled identity write failure after leader exit")
    monkeypatch.setattr(installer_process, "atomic_json", Mock(side_effect=error))
    assert controlled_installer(leader_exited=True) is error


def test_installer_startup_failure_ignores_previous_pidfile(
    controlled_installer, tmp_path, monkeypatch
):
    record = tmp_path / "process.json"
    original = json.dumps({"pid": os.getpid(), "start": installer_process.identity(os.getpid())})
    record.write_text(original)
    error = OSError("controlled identity flush failure")
    monkeypatch.setattr(os, "fsync", Mock(side_effect=error))
    recover = Mock(side_effect=AssertionError("Do not reap a previous process record"))
    monkeypatch.setattr(installer_process, "reap", recover)

    assert controlled_installer() is error
    recover.assert_not_called()
    assert record.read_text() == original
    assert not list(tmp_path.glob(".process.json-*.tmp"))


@pytest.mark.parametrize("cleanup_error", [ProcessLookupError(), PermissionError("denied")])
def test_installer_startup_cleanup_preserves_error_on_signal_race(
    tmp_path, monkeypatch, cleanup_error
):
    process = Mock(pid=12345)
    error = OSError("controlled identity write failure")
    monkeypatch.setattr(installer_process.subprocess, "Popen", Mock(return_value=process))
    monkeypatch.setattr(installer_process, "identity", Mock(return_value="123"))
    monkeypatch.setattr(installer_process, "atomic_json", Mock(side_effect=error))
    kill_group = Mock(side_effect=cleanup_error)
    monkeypatch.setattr(os, "killpg", kill_group)

    with pytest.raises(OSError) as raised:
        run([sys.executable, "-c", "pass"], tmp_path, lambda: None, lambda _: None)

    assert raised.value is error
    kill_group.assert_called_once_with(process.pid, signal.SIGKILL)
    process.poll.assert_not_called()
    if isinstance(cleanup_error, ProcessLookupError):
        process.wait.assert_called_once_with(timeout=5)
    else:
        process.wait.assert_not_called()
        assert "Installer startup cleanup failed: denied" in error.__notes__


def test_installer_startup_cleanup_wait_is_bounded(tmp_path, monkeypatch):
    process = Mock(pid=12345)
    process.wait.side_effect = subprocess.TimeoutExpired("controlled installer", 5)
    error = OSError("controlled identity write failure")
    monkeypatch.setattr(installer_process.subprocess, "Popen", Mock(return_value=process))
    monkeypatch.setattr(installer_process, "identity", Mock(return_value="123"))
    monkeypatch.setattr(installer_process, "atomic_json", Mock(side_effect=error))
    monkeypatch.setattr(os, "killpg", Mock())

    with pytest.raises(OSError) as raised:
        run([sys.executable, "-c", "pass"], tmp_path, lambda: None, lambda _: None)

    assert raised.value is error
    process.wait.assert_called_once_with(timeout=5)
    assert "Installer startup cleanup failed:" in error.__notes__[0]


@pytest.mark.parametrize("exit_code", [0, 7])
def test_real_installer_completion_preserves_output_and_status(tmp_path, exit_code):
    command = [sys.executable, "-c", f"print('installer output'); raise SystemExit({exit_code})"]
    if exit_code:
        with pytest.raises(RuntimeError, match=f"exited with code {exit_code}"):
            run(command, tmp_path, lambda: None, lambda _: None)
    else:
        assert run(command, tmp_path, lambda: None, lambda _: None) == "installer output\n"
    assert (tmp_path / "install.log").read_text() == "installer output\n"
    assert not (tmp_path / "process.json").exists()


def test_deployment_api_origin_validation_and_saved_state(client_factory, tmp_path):
    with client_factory() as client:
        assert client.get("/api/deployment").status_code == 200
        body = {"location": str(tmp_path / "components"), "automatic": False}
        assert (
            client.post(
                "/api/deployment/config", json=body, headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/deployment/config", json={**body, "arbitrary_command": "run"}
            ).status_code
            == 422
        )
        assert client.post("/api/deployment/config", json=body).status_code == 200
        assert client.post("/api/deployment/packages/unknown/install", json={}).status_code == 409
        assert client.get("/api/lifecycle").json() == {"busy": False}
    with client_factory() as client:
        assert client.get("/api/deployment").json()["config"]["root"].endswith("x-dde-managed")


def test_cli_real_start_status_stop_case_insensitive(tmp_path):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    env = dict(os.environ, WB_HOME=str(tmp_path / "home"), WB_STATE_DIR=str(tmp_path / "state"))
    command = [sys.executable, "-m", "opendde_workbench.cli"]

    def invoke(*args):
        return subprocess.run(
            [*command, *args], env=env, capture_output=True, text=True, timeout=40
        )

    try:
        started = invoke("DaShBoArD", "--port", str(port), "--no-browser", "--no-auto-deploy")
        assert started.returncode == 0, started.stderr
        assert f"127.0.0.1:{port}" in started.stdout
        assert json.loads(invoke("STATUS").stdout)["running"]
        assert invoke("UI", "STOP").returncode == 0
        assert not json.loads(invoke("status").stdout)["running"]
    finally:
        invoke("stop")


@pytest.mark.parametrize("name", ["X-DDE", "x-dde", "xdde", "opendde", "OpenDDE", "OPENDDE"])
def test_installed_brand_and_legacy_commands(name):
    executable = Path(sys.executable).parent / name
    result = subprocess.run([str(executable), "HeLp"], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert "usage: X-DDE" in result.stdout


def test_existing_platform_components_keep_owned_legacy_storage(tmp_path):
    base = tmp_path / "components"
    legacy = base / "opendde-managed"
    legacy.mkdir(parents=True)
    atomic_json(legacy / ".workbench-owner.json", {"owner": "opendde-workbench", "id": "original"})
    original = legacy / "models" / "retained-model.bin"
    original.parent.mkdir()
    original.write_bytes(b"existing scientific resource")
    manager = DeploymentManager(tmp_path / "state")
    assert manager.configure(str(base), False)["config"]["root"] == str(legacy)
    assert managed_root(str(base)) == legacy
    assert original.read_bytes() == b"existing scientific resource"
    assert read_json(legacy / ".workbench-owner.json")["id"] == "original"
    assert not (base / "x-dde-managed").exists()
    (base / "x-dde-managed").mkdir()
    with pytest.raises(ValueError, match="Both X-DDE and legacy"):
        managed_root(str(base))


def test_new_platform_storage_does_not_adopt_a_legacy_owner_marker(tmp_path):
    new = tmp_path / "x-dde-managed"
    new.mkdir()
    atomic_json(new / ".workbench-owner.json", {"owner": "opendde-workbench"})
    with pytest.raises(ValueError, match="does not belong to X-DDE"):
        managed_root(str(tmp_path))


@pytest.mark.parametrize("state", ["installed", "queued", "paused"])
def test_rejected_location_change_never_creates_an_unselected_directory(tmp_path, state):
    manager = DeploymentManager(tmp_path / "state")
    first = tmp_path / "current"
    manager.configure(str(first), False)
    root = first / "x-dde-managed"
    retained = root / "original-model.bin"
    retained.write_bytes(b"existing resource")
    if state == "installed":
        atomic_json(root / "installed.json", {"ketcher": {"version": "3.18.0"}})
    else:
        operation = manager.enqueue("ketcher", "install")[0]
        if state == "paused":
            manager.control(operation, "pause")
    target = tmp_path / "new-location"
    assert manager.snapshot()["location_locked"]
    with pytest.raises(ValueError, match="before changing location"):
        manager.configure(str(target), False)
    assert not target.exists()
    assert manager.store.config()["root"] == str(root)
    assert retained.read_bytes() == b"existing resource"
    assert manager.configure(str(first), False)["config"]["root"] == str(root)


def test_location_preflight_is_read_only_and_first_install_persists(tmp_path):
    base = tmp_path / "chosen"
    root = managed_root(str(base), create=False)
    assert root == base / "x-dde-managed"
    assert not base.exists()
    manager = DeploymentManager(tmp_path / "state")
    assert not manager.snapshot()["location_locked"]
    manager.configure(str(base), False)
    restored = DeploymentManager(tmp_path / "state")
    assert restored.store.config()["root"] == str(root)
    assert read_json(root / ".workbench-owner.json")["owner"] == "X-DDE"


@pytest.mark.parametrize("state", ["paused", "failed"])
@pytest.mark.parametrize("action", ["install", "upgrade", "uninstall"])
def test_busy_resume_does_not_requeue_deployment(tmp_path, state, action):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from opendde_workbench.deployment.routes import register_deployments

    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    identifier = manager.enqueue("ketcher", action)[-1]
    manager.store.update(identifier, state=state)
    before = manager.store.get(identifier)
    calls = []

    async def busy():
        calls.append(True)
        return True

    app = FastAPI()
    register_deployments(app, manager, lambda: None, busy)
    with TestClient(app) as client:
        response = client.post(f"/api/deployment/operations/{identifier}/resume")
    assert response.status_code == 409
    assert calls == [True]
    assert manager.store.get(identifier) == before


def test_worker_admission_blocks_queued_operation_without_claim_or_install(tmp_path, monkeypatch):
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    identifier = manager.enqueue("ketcher", "install")[-1]
    before = manager.store.get(identifier)
    called = []
    manager.admission = lambda claim: called.append("checked")
    monkeypatch.setattr(
        "opendde_workbench.deployment.manager.install",
        lambda *args, **kwargs: pytest.fail("Blocked deployment must not call installer"),
    )
    manager.tick()
    assert called == ["checked"]
    assert manager.store.get(identifier) == before


@pytest.mark.parametrize("busy_result", [False, "unknown"])
def test_resume_idle_or_unverifiable_preserves_control_contract(tmp_path, busy_result):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient

    from opendde_workbench.deployment.routes import register_deployments

    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    identifier = manager.enqueue("ketcher", "install")[-1]
    manager.control(identifier, "pause")
    calls = []

    async def busy():
        calls.append(True)
        if busy_result == "unknown":
            raise HTTPException(503, "Native state unavailable")
        return False

    app = FastAPI()
    register_deployments(app, manager, lambda: None, busy)
    with TestClient(app) as client:
        response = client.post(f"/api/deployment/operations/{identifier}/resume")
        assert response.status_code == (503 if busy_result == "unknown" else 200)
        assert manager.store.get(identifier)["state"] == (
            "paused" if busy_result == "unknown" else "queued"
        )
        if busy_result is False:
            assert client.post(f"/api/deployment/operations/{identifier}/pause").status_code == 200
        assert client.post(f"/api/deployment/operations/{identifier}/cancel").status_code == 200
    assert calls == [True]  # Pause/cancel never depend on native availability.


@pytest.fixture
def deployment_admission_app(settings, monkeypatch):
    """Real application middleware/SQLite; startup and all executors are inert."""
    import asyncio
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from opendde_workbench import api
    from opendde_workbench.harness_service import HarnessService
    from opendde_workbench.store import Store
    from opendde_workbench.worker import Worker

    manager = DeploymentManager(settings.state_dir)
    manager.configure(str(settings.state_dir.parent / "components"), False)

    def configured_manager(state, *, msa_url):
        assert state == settings.state_dir and msa_url == settings.msa_url
        return manager

    monkeypatch.setattr(api, "DeploymentManager", configured_manager)
    monkeypatch.setattr(manager.compute, "ensure", lambda: None)

    async def worker_start(self):
        self.task = asyncio.current_task()  # Readiness only; no worker loop starts.

    async def idle(*args):
        pass

    async def no_campaign(self, message, **kwargs):
        assert message == {"operation": "active"}
        return []

    monkeypatch.setattr(Worker, "start", worker_start)
    monkeypatch.setattr(Worker, "close", idle)
    monkeypatch.setattr(manager, "start", idle)
    monkeypatch.setattr(manager, "close", idle)
    monkeypatch.setattr(HarnessService, "invoke", no_campaign)
    monkeypatch.setattr(
        "opendde_workbench.deployment.manager.install",
        lambda *args, **kwargs: pytest.fail("No real installer in admission fixtures"),
    )
    monkeypatch.setattr(
        "opendde_workbench.deployment.manager.shutil.rmtree",
        lambda *args, **kwargs: pytest.fail("No component deletion in admission fixtures"),
    )

    class InertEngine:
        readiness_probe = None

        async def readiness(self):
            if self.readiness_probe is not None:
                return await self.readiness_probe()
            return {"ready": True, "gpu": "controlled readiness", "reason": None}

        async def start(self, *args):
            pytest.fail("No scientific work in admission fixtures")

    engine = InertEngine()
    app = api.create_app(replace(settings, harness_python=Path(sys.executable)), engine)
    with TestClient(app, base_url="http://127.0.0.1:4320") as client:
        client.headers["X-Workbench-CSRF"] = client.get("/api/session").json()["csrf_token"]
        yield client, manager, Store(settings.state_dir / "jobs.sqlite3"), engine


@pytest.mark.parametrize("status", ["queued", "running", "cancelling", "paused"])
def test_application_worker_blocks_preexisting_queue_while_science_active(
    deployment_admission_app, monkeypatch, status
):
    from uuid import uuid4

    from opendde_workbench.prediction import Prediction

    _, manager, store, _ = deployment_admission_app
    identifier = manager.enqueue("compute", "uninstall")[-1]
    job = store.create(
        Prediction(name="admission fixture", components=[{"kind": "ligand", "value": "CCO"}]),
        str(uuid4()),
        10,
        20,
    )
    with store.connect() as db:
        db.execute("UPDATE jobs SET status=? WHERE id=?", (status, job.id))
    before = manager.store.get(identifier)
    monkeypatch.setattr(
        manager, "_execute", lambda *args: pytest.fail("Busy worker must not execute")
    )
    manager.tick()
    assert manager.store.get(identifier) == before
    assert store.get(job.id).status == status


def test_application_worker_unknown_native_state_stays_queued_and_can_recover(
    deployment_admission_app, monkeypatch
):
    from opendde_workbench.harness_service import HarnessService

    _, manager, _, _ = deployment_admission_app
    identifier = manager.enqueue("compute", "uninstall")[-1]
    before = manager.store.get(identifier)
    executed = []
    monkeypatch.setattr(manager, "_execute", lambda row, *_: executed.append(row["id"]))

    async def unavailable(*args, **kwargs):
        raise TimeoutError("controlled native status timeout")

    monkeypatch.setattr(HarnessService, "invoke", unavailable)
    manager.tick()
    assert manager.store.get(identifier) == before
    assert not executed

    async def idle(*args, **kwargs):
        return []

    monkeypatch.setattr(HarnessService, "invoke", idle)
    manager.tick()
    assert manager.store.get(identifier)["state"] == "running"
    assert executed == [identifier]


def test_application_worker_rechecks_claim_after_pause_during_native_probe(
    deployment_admission_app, monkeypatch
):
    from concurrent.futures import ThreadPoolExecutor

    from opendde_workbench.harness_service import HarnessService

    _, manager, _, _ = deployment_admission_app
    identifier = manager.enqueue("compute", "uninstall")[-1]
    entered, release = threading.Event(), threading.Event()

    async def probe(*args, **kwargs):
        import asyncio

        entered.set()
        assert await asyncio.to_thread(release.wait, 5)
        return []

    monkeypatch.setattr(HarnessService, "invoke", probe)
    monkeypatch.setattr(manager, "_execute", lambda *args: pytest.fail("Paused claim must not run"))
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(manager.tick)
        try:
            assert entered.wait(5)
            manager.control(identifier, "pause")  # No manager mutex held across async probe.
        finally:
            release.set()
        future.result(timeout=5)
    assert manager.store.get(identifier)["state"] == "paused"


def test_application_worker_releases_submission_lock_before_execution(
    deployment_admission_app, monkeypatch
):
    from uuid import uuid4

    from conftest import payload

    client, manager, store, _ = deployment_admission_app
    identifier = manager.enqueue("compute", "uninstall")[-1]
    observed = []

    def execute(row, *_):
        assert row["id"] == identifier
        assert manager.store.get(identifier)["state"] == "running"
        response = client.post(
            "/api/jobs", json=payload(), headers={"Idempotency-Key": str(uuid4())}
        )
        observed.append(response.status_code)

    monkeypatch.setattr(manager, "_execute", execute)
    manager.tick()
    assert observed == [409]
    assert not store.list_jobs()


@pytest.mark.parametrize("first", ["submission", "resume"])
def test_resume_and_scientific_submission_share_atomic_admission(
    deployment_admission_app, monkeypatch, first
):
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from uuid import uuid4

    from conftest import payload

    from opendde_workbench.harness_service import HarnessService

    client, manager, store, engine = deployment_admission_app
    identifier = manager.enqueue("compute", "uninstall")[-1]
    manager.control(identifier, "pause")
    entered, release, second_started = (threading.Event() for _ in range(3))

    async def held_readiness():
        entered.set()
        assert await asyncio.to_thread(release.wait, 5)
        return {"ready": True, "gpu": "controlled readiness", "reason": None}

    async def held_native_probe(*args, **kwargs):
        entered.set()
        assert await asyncio.to_thread(release.wait, 5)
        return []

    def submit():
        return client.post("/api/jobs", json=payload(), headers={"Idempotency-Key": str(uuid4())})

    def resume():
        return client.post(f"/api/deployment/operations/{identifier}/resume")

    if first == "submission":
        monkeypatch.setattr(engine, "readiness_probe", held_readiness)
        actions = submit, resume
    else:
        monkeypatch.setattr(HarnessService, "invoke", held_native_probe)
        actions = resume, submit

    def second():
        second_started.set()
        return actions[1]()

    with ThreadPoolExecutor(max_workers=2) as pool:
        leading = pool.submit(actions[0])
        try:
            assert entered.wait(5)
            following = pool.submit(second)
            assert second_started.wait(5)
        finally:
            release.set()
        first_response, second_response = leading.result(timeout=5), following.result(timeout=5)
    assert first_response.status_code == (201 if first == "submission" else 200)
    assert second_response.status_code == 409
    assert manager.store.get(identifier)["state"] == (
        "paused" if first == "submission" else "queued"
    )
    assert len(store.list_jobs()) == (1 if first == "submission" else 0)


def test_restarted_operation_still_requires_worker_admission_after_resume(tmp_path, monkeypatch):
    import asyncio

    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    identifier = manager.enqueue("compute", "uninstall")[-1]
    manager.store.update(identifier, state="running")
    restored = DeploymentManager(tmp_path / "state")

    async def recover_only():
        await restored.start()
        await restored.close()  # No loop iteration or actual component work.

    asyncio.run(recover_only())
    assert restored.store.get(identifier)["state"] == "paused"
    restored.control(identifier, "resume")
    calls = []
    restored.admission = lambda claim: calls.append("blocked")
    monkeypatch.setattr(restored, "_execute", lambda *args: pytest.fail("Must remain queued"))
    restored.tick()
    assert calls == ["blocked"]
    assert restored.store.get(identifier)["state"] == "queued"


def test_retained_native_pause_blocks_deployment_until_cancellation_is_confirmed(
    deployment_admission_app, monkeypatch
):
    from uuid import uuid4

    from opendde_workbench.prediction import Prediction

    client, manager, store, engine = deployment_admission_app
    identifier = manager.enqueue("compute", "uninstall")[-1]
    manager.control(identifier, "pause")
    job = store.create(
        Prediction(name="retained pause fixture", components=[{"kind": "ligand", "value": "CCO"}]),
        str(uuid4()),
        10,
        20,
    )
    store.claim(job.id)
    store.retain_paused(job.id)
    executed = []
    monkeypatch.setattr(manager, "_execute", lambda row, *_: executed.append(row["id"]))
    # The external upgrade contract may close the UI while retaining a native pause.
    assert client.get("/api/lifecycle").json()["busy"] is False
    response = client.post(f"/api/deployment/operations/{identifier}/resume")
    assert response.status_code == 409
    assert manager.store.get(identifier)["state"] == "paused"

    # Also protect a preexisting/recovered queued operation at execution admission.
    manager.control(identifier, "resume")
    manager.tick()
    assert manager.store.get(identifier)["state"] == "queued"
    assert not executed

    async def unconfirmed_stop(_):
        raise RuntimeError("Controlled native stop remains unconfirmed")

    monkeypatch.setattr(engine, "stop", unconfirmed_stop, raising=False)
    response = client.post(f"/api/jobs/{job.id}/cancel")
    assert response.status_code == 503
    assert store.get(job.id).status == "paused"
    manager.tick()
    assert manager.store.get(identifier)["state"] == "queued"
    assert not executed

    stopped = []

    async def confirmed_stop(value):
        stopped.append(value)

    monkeypatch.setattr(engine, "stop", confirmed_stop)
    response = client.post(f"/api/jobs/{job.id}/cancel")
    assert response.status_code == 200
    assert stopped == [job.id] and store.get(job.id).status == "cancelled"
    manager.tick()
    assert executed == [identifier]
    assert manager.store.get(identifier)["state"] == "running"
