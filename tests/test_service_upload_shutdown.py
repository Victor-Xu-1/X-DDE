"""An HTTP shutdown deadline must not interrupt file publication and its transaction."""

import hashlib
import http.client
import json
import os
import signal
import socket
import sqlite3
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from test_service_shutdown import SERVER

from opendde_workbench import service_control as control


def test_ui_shutdown_finishes_a_cancelled_resumable_upload(tmp_path, monkeypatch):
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("WB_AUTO_DEPLOY", "0")
    (tmp_path / "hold-upload").touch()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    log_path = tmp_path / "upload-shutdown.log"
    with log_path.open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-u", "-c", SERVER, str(tmp_path), "--port", str(port)],
            env=dict(os.environ),
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    token = None

    def request(method, path, body=None, headers=None):
        client = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
        try:
            client.request(
                method,
                path,
                body=body,
                headers={"X-Workbench-Csrf": token, **(headers or {})},
            )
            response = client.getresponse()
            data = response.read()
            return response.status, data
        finally:
            client.close()

    try:
        deadline = time.monotonic() + 15
        while token is None:
            assert process.poll() is None, log_path.read_text()
            try:
                token = control.session(port, timeout=1)["csrf_token"]
            except OSError:
                assert time.monotonic() < deadline, log_path.read_text()
                time.sleep(0.05)
        (tmp_path / "service.json").write_text(
            json.dumps(
                {
                    "pid": process.pid,
                    "identity": control.process_identity(process.pid),
                    "port": port,
                }
            )
        )
        content = b"compound_id,target,control\nA035-B040-C030,92,3\n"
        status, data = request(
            "POST",
            "/api/assets/uploads",
            json.dumps({"name": "DEL006.csv", "kind": "counts", "size": len(content)}),
            {"Content-Type": "application/json", "Idempotency-Key": str(uuid4())},
        )
        assert status == 201, data
        identifier = json.loads(data)["id"]
        path = "/api/assets/uploads/" + identifier
        status, data = request(
            "PUT",
            path + "?offset=0",
            content,
            {"X-Chunk-Sha256": hashlib.sha256(content).hexdigest()},
        )
        assert status == 200, data
        with ThreadPoolExecutor(max_workers=2) as threads:
            completion = threads.submit(request, "POST", path + "/complete")
            try:
                deadline = time.monotonic() + 10
                while not (tmp_path / "upload-moved").exists():
                    assert not completion.done(), completion.result()
                    assert time.monotonic() < deadline, log_path.read_text()
                    time.sleep(0.05)
                stopping = threads.submit(control.stop)
                deadline = time.monotonic() + 10
                while "timeout graceful shutdown exceeded" not in log_path.read_text():
                    assert process.poll() is None, log_path.read_text()
                    assert time.monotonic() < deadline, log_path.read_text()
                    time.sleep(0.05)
                # HTTP cancellation has occurred; the publication worker still owns
                # both the moved file and the uncommitted asset transaction.
                with pytest.raises(subprocess.TimeoutExpired):
                    process.wait(timeout=1)
            finally:
                (tmp_path / "release-upload").touch()
            stopping.result(timeout=8)
            process.wait(timeout=5)
            assert completion.result(timeout=3)[0] == 500
        assert (tmp_path / "closed").read_text() == "closed\n"
        with sqlite3.connect(tmp_path / "state/jobs.sqlite3") as db:
            assert db.execute(
                "SELECT state,asset_id FROM asset_uploads WHERE id=?",
                (identifier,),
            ).fetchone() == ("complete", identifier)
            assert db.execute("SELECT size FROM assets WHERE id=?", (identifier,)).fetchone() == (
                len(content),
            )
        target = tmp_path / "state/assets" / identifier / "content.csv"
        assert target.read_bytes() == content
        assert not (tmp_path / "state/assets/.uploads" / identifier).exists()
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
    finally:
        (tmp_path / "release-upload").touch()
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
