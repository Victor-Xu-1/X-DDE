"""Owned-loopback lifecycle contracts, without a daemon or scientific execution."""

import json
import signal
import threading
import time
import urllib.error
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from opendde_workbench import service_control as control


@contextmanager
def local_server(*, busy=False, delay=0, redirect=None):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def respond(self):
            requests.append((self.command, self.path, self.headers.get("X-Workbench-CSRF")))
            if redirect:
                self.send_response(302)
                self.send_header("Location", redirect)
                self.end_headers()
                return
            if self.path == "/api/session":
                time.sleep(delay)
                value = {"csrf_token": "owned-token", "instance": "owned-instance"}
            else:
                assert self.path == "/api/lifecycle/stop" and self.command == "POST"
                assert self.headers["X-Workbench-CSRF"] == "owned-token"
                assert self.rfile.read(int(self.headers["Content-Length"])) == b"{}"
                value = {"busy": busy}
            payload = json.dumps(value).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            try:
                self.wfile.write(payload)
            except BrokenPipeError:
                pass  # A bounded client timeout deliberately closes its socket.

        do_GET = do_POST = respond

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield server.server_port, requests
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)


def owned_record(monkeypatch, tmp_path, port, alive_states):
    monkeypatch.setenv("WB_HOME", str(tmp_path))
    monkeypatch.setattr(control, "home", lambda: tmp_path)
    (tmp_path / "service.json").write_text(
        json.dumps({"pid": 424242, "identity": "owned-start-time", "port": port})
    )
    states = iter(alive_states)
    monkeypatch.setattr(control, "alive", lambda record: next(states))
    signals = []
    monkeypatch.setattr(control.os, "killpg", lambda pid, sig: signals.append((pid, sig)))
    return signals


def test_local_session_and_shutdown_never_transmit_through_system_proxy(monkeypatch, tmp_path):
    with local_server() as (proxy_port, proxy_requests), local_server() as (port, requests):
        for name in ("HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY"):
            monkeypatch.setenv(name, f"http://127.0.0.1:{proxy_port}")
        monkeypatch.setenv("NO_PROXY", "")
        monkeypatch.setenv("no_proxy", "")
        signals = owned_record(monkeypatch, tmp_path, port, [True, True, False])
        control.stop()
        assert requests == [
            ("GET", "/api/session", None),
            ("POST", "/api/lifecycle/stop", "owned-token"),
        ]
        assert not proxy_requests
        assert signals == [(424242, signal.SIGTERM)]


def test_local_session_accepts_slow_response_with_a_bounded_deadline():
    with local_server(delay=2.1) as (port, requests):
        assert control.session(port)["instance"] == "owned-instance"
        assert len(requests) == 1


def test_session_timeout_does_not_retry_or_signal(monkeypatch):
    signals = []
    monkeypatch.setattr(control.os, "killpg", lambda *args: signals.append(args))
    with local_server(delay=0.15) as (port, requests):
        with pytest.raises(TimeoutError):
            control.session(port, timeout=0.02)
        assert len(requests) == 1 and not signals


def test_busy_lifecycle_still_rejects_shutdown(monkeypatch, tmp_path):
    with local_server(busy=True) as (port, requests):
        signals = owned_record(monkeypatch, tmp_path, port, [True])
        with pytest.raises(RuntimeError, match="Tasks or deployments are active"):
            control.stop()
        assert len(requests) == 2 and not signals


def test_identity_change_after_handshake_never_signals_reused_pid(monkeypatch, tmp_path):
    with local_server() as (port, requests):
        signals = owned_record(monkeypatch, tmp_path, port, [True, False])
        control.stop()
        assert len(requests) == 2 and not signals


def test_stale_record_never_contacts_a_different_service(monkeypatch, tmp_path):
    with local_server() as (port, requests):
        signals = owned_record(monkeypatch, tmp_path, port, [False])
        control.stop()
        assert not requests and not signals


def test_session_and_stop_redirects_cannot_forward_the_service_token():
    with (
        local_server() as (other_port, other_requests),
        local_server(redirect=f"http://127.0.0.1:{other_port}/api/lifecycle/stop") as (port, _),
    ):
        with pytest.raises(urllib.error.HTTPError, match="302"):
            control.session(port)
        with pytest.raises(urllib.error.HTTPError, match="302"):
            control._local_request(port, "/api/lifecycle/stop", timeout=1, token="owned-token")
        assert not other_requests


@pytest.mark.parametrize("port", [0, 65536, True, "4322"])
def test_invalid_record_ports_cannot_redirect_local_requests(port):
    with pytest.raises(ValueError, match="valid local service port"):
        control.session(port)


@contextmanager
def controlled_start(monkeypatch, tmp_path, *, exit_early=False):
    """Spawn only an owned idle Python process; never start the application."""
    import os
    import socket
    import subprocess
    import sys

    monkeypatch.setenv("WB_HOME", str(tmp_path))
    real_popen = subprocess.Popen
    children = []
    instance = {}
    marker = tmp_path / "child-ready"

    def spawn(args, **kwargs):
        instance["value"] = kwargs["env"]["WB_INSTANCE"]
        child = real_popen(
            [
                sys.executable,
                "-c",
                "import pathlib,sys,time; pathlib.Path(sys.argv[1]).touch(); "
                f"time.sleep({0 if exit_early else 60})",
                str(marker),
                "opendde_workbench",
            ],
            **kwargs,
        )
        children.append(child)
        deadline = time.monotonic() + 3
        while not marker.exists():
            assert time.monotonic() < deadline, "Controlled child did not start"
            time.sleep(0.01)
        return child

    monkeypatch.setattr(control.subprocess, "Popen", spawn)
    monkeypatch.setattr(
        control, "session", lambda *a, **kw: {"instance": instance["value"], "csrf_token": "probe"}
    )
    monkeypatch.setattr(control, "_local_request", lambda *a, **kw: {"busy": False})
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    try:
        yield port, children
    finally:
        # A failing baseline assertion must not leave the fixture child running.
        for child in children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=3)


@pytest.mark.parametrize("failure", ["identity", "write", "path-collision"])
@pytest.mark.parametrize("previous", [False, True])
def test_start_identity_failure_reaps_owned_child(monkeypatch, tmp_path, failure, previous):
    import errno
    import os

    record = tmp_path / "service.json"
    old = {"pid": 999999999, "identity": "stale", "port": 4322}
    if previous and failure != "path-collision":
        record.write_text(json.dumps(old))
    (tmp_path / "service-port.json").write_text('{"port":4322}')
    original = (
        PermissionError(errno.EACCES, "Controlled identity failure")
        if failure == "identity"
        else OSError(errno.ENOSPC, "Controlled persistence failure")
    )
    with controlled_start(monkeypatch, tmp_path) as (port, children):
        signals = []
        killpg = os.killpg

        def signal_owned(pid, value):
            signals.append((pid, value))
            return killpg(pid, value)

        monkeypatch.setattr(control.os, "killpg", signal_owned)
        if failure == "identity":
            real_identity = control.process_identity

            def identity(pid):
                if children and pid == children[0].pid:
                    raise original
                return real_identity(pid)

            monkeypatch.setattr(control, "process_identity", identity)
        elif failure == "write":

            def fail_write(*args):
                raise original

            monkeypatch.setattr(control, "atomic_json", fail_write)
        else:
            record.mkdir()
        with pytest.raises(OSError) as error:
            control.start(port, False)
        if failure != "path-collision":
            assert error.value is original
        assert children[0].returncode is not None, "Owned startup child was not reaped"
        assert signals == [(children[0].pid, signal.SIGTERM)]
        assert not control.status()["running"]
        control.stop()
        assert json.loads((tmp_path / "service-port.json").read_text()) == {"port": 4322}
        if previous and failure != "path-collision":
            assert json.loads(record.read_text()) == old
        elif failure != "path-collision":
            assert not record.exists()


def test_start_identity_failure_after_child_exit_keeps_original(monkeypatch, tmp_path):
    import errno

    original = OSError(errno.ENOSPC, "Controlled identity failure after exit")
    with controlled_start(monkeypatch, tmp_path, exit_early=True) as (port, children):

        def fail_write(*args):
            # Leave the exited child unreaped, as the real start path does.
            time.sleep(0.1)
            raise original

        monkeypatch.setattr(control, "atomic_json", fail_write)
        with pytest.raises(OSError) as error:
            control.start(port, False)
        assert error.value is original
        assert children[0].returncode == 0


def test_start_normal_and_repeated_start_keep_owned_service(monkeypatch, tmp_path):
    with controlled_start(monkeypatch, tmp_path) as (port, children):
        assert control.start(port, False) == f"http://127.0.0.1:{port}/"
        assert control.start(None, False) == f"http://127.0.0.1:{port}/"
        assert len(children) == 1 and children[0].poll() is None
        assert json.loads((tmp_path / "service-port.json").read_text()) == {"port": port}
        control.stop()
        assert children[0].wait(timeout=3) == -signal.SIGTERM


@pytest.mark.parametrize("failure", ["signal", "timeout"])
def test_start_cleanup_uncertainty_preserves_original_error(monkeypatch, tmp_path, failure):
    import errno
    import subprocess

    popen_type = subprocess.Popen
    original = OSError(errno.ENOSPC, "Original startup failure")
    with controlled_start(monkeypatch, tmp_path) as (port, children):

        def fail_write(*args):
            raise original

        def deny_signal(*args):
            raise PermissionError(errno.EACCES, "Controlled signal failure")

        def pending_wait(*args, **kwargs):
            assert kwargs["timeout"] == 10
            raise subprocess.TimeoutExpired("controlled-child", 10)

        with monkeypatch.context() as fault:
            fault.setattr(control, "atomic_json", fail_write)
            if failure == "signal":
                fault.setattr(control.os, "killpg", deny_signal)
            else:
                fault.setattr(control.os, "killpg", lambda *args: None)
                fault.setattr(popen_type, "wait", pending_wait)
            with pytest.raises(RuntimeError, match="shutdown.*unconfirmed") as error:
                control.start(port, False)
        assert error.value.__cause__ is original
        assert "Original startup failure" in str(error.value)
        assert "No forced kill" in str(error.value)
        assert children[0].poll() is None
