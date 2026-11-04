"""Real UI process, held read response, original port and application cleanup."""

import http.client
import json
import os
import signal
import socket
import subprocess
import sys
import time

import pytest

from opendde_workbench import service_control as control

SERVER = """
import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
from pathlib import Path
import sys

from starlette.responses import StreamingResponse
from opendde_workbench import api
from opendde_workbench.settings import Settings

root = Path(sys.argv.pop(1))

class NoComputeEngine:
    async def readiness(self):
        return {"ready": False, "gpu": "", "reason": "Lifecycle fixture."}

    async def start(self, job, directory):
        raise AssertionError("This fixture must never execute a research task.")

    async def stop(self, job_id):
        raise AssertionError("This fixture has no active research tasks.")

app = api.create_app(replace(Settings.from_env(), minimum_free_bytes=0), NoComputeEngine())
original_lifespan = app.router.lifespan_context

@asynccontextmanager
async def lifespan(app):
    async with original_lifespan(app):
        yield
    with (root / "closed").open("a") as receipt:
        receipt.write("closed\\n")

app.router.lifespan_context = lifespan

@app.get("/held-read")
async def held():
    async def body():
        yield b"ready"
        while not (root / "release").exists():
            await asyncio.sleep(0.1)
    return StreamingResponse(body())

api.create_app = lambda: app
from opendde_workbench.__main__ import main
main()
"""


@pytest.mark.parametrize("held", [False, True])
def test_ui_stop_drains_reads_and_reuses_its_original_port(tmp_path, monkeypatch, held):
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("WB_AUTO_DEPLOY", "0")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    asset = tmp_path / "retained-research-file"
    asset.write_bytes(b"Original research input remains intact.")
    original = asset.read_bytes()
    for iteration in range(2):
        client = response = None
        log_path = tmp_path / f"service-{iteration}.log"
        with log_path.open("w") as log:
            process = subprocess.Popen(
                [sys.executable, "-u", "-c", SERVER, str(tmp_path), "--port", str(port)],
                env=dict(os.environ),
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        try:
            deadline = time.monotonic() + 15
            while True:
                assert process.poll() is None, log_path.read_text()
                try:
                    control.session(port, timeout=1)
                    break
                except OSError:
                    assert time.monotonic() < deadline, log_path.read_text()
                    time.sleep(0.1)
            record = {
                "pid": process.pid,
                "identity": control.process_identity(process.pid),
                "port": port,
            }
            (tmp_path / "service.json").write_text(json.dumps(record))
            if held:
                client = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
                client.request("GET", "/held-read")
                response = client.getresponse()
                assert response.status == 200 and response.read(1) == b"r"
            started = time.monotonic()
            control.stop()
            process.wait(timeout=5)
            assert time.monotonic() - started < 10
            assert not control.alive(record)
            assert (tmp_path / "closed").read_text().splitlines() == ["closed"] * (iteration + 1)
            assert control.choose_port(None) == port
            assert asset.read_bytes() == original
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(("127.0.0.1", port))
            if held:
                assert "timeout graceful shutdown exceeded" in log_path.read_text()
        finally:
            (tmp_path / "release").touch()
            if response:
                response.close()
            if client:
                client.close()
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            (tmp_path / "release").unlink(missing_ok=True)
