"""Real HTTP, archive, SQLite and process boundaries; never scientific inference."""

import hashlib
import io
import json
import os
import socket
import subprocess
import sys
import tarfile
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from opendde_workbench.deployment.catalog import dependencies
from opendde_workbench.deployment.manager import DeploymentManager
from opendde_workbench.deployment.process import Paused, run
from opendde_workbench.deployment.storage import DeployStore, managed_root
from opendde_workbench.deployment.transfers import download, extract
from opendde_workbench.locations import atomic_json, read_json


def test_location_ownership_and_no_symlinks(tmp_path):
    base = tmp_path / "data"
    root = managed_root(str(base))
    assert root == base / "opendde-managed"
    assert managed_root(str(base)) == root
    assert read_json(root / ".workbench-owner.json")["owner"] == "opendde-workbench"
    with pytest.raises(ValueError):
        managed_root("/etc")
    (tmp_path / "other").mkdir()
    (tmp_path / "other/opendde-managed").symlink_to(root)
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


def test_uninstall_removes_only_owned_package_and_retains_models(tmp_path):
    manager = DeploymentManager(tmp_path / "state")
    manager.configure(str(tmp_path / "components"), False)
    root = tmp_path / "components/opendde-managed"
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
        assert client.get("/api/deployment").json()["config"]["root"].endswith("opendde-managed")


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
