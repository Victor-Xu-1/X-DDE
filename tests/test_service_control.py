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
