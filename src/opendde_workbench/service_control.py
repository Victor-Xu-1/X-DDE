"""Detached UI service with an identity check before every signal."""

import fcntl
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from .locations import atomic_json, home, read_json


@contextmanager
def lock():
    home().mkdir(parents=True, exist_ok=True, mode=0o700)
    with (home() / "service.lock").open("w") as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        yield


def process_identity(pid: int) -> str:
    return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]


def alive(record: dict) -> bool:
    try:
        return (
            process_identity(record["pid"]) == record["identity"]
            and b"opendde_workbench" in Path(f"/proc/{record['pid']}/cmdline").read_bytes()
        )
    except (FileNotFoundError, ProcessLookupError, KeyError):
        return False


def session(port: int):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/session", timeout=2) as response:
        return json.load(response)


def status() -> dict:
    record = read_json(home() / "service.json")
    return {
        **{k: v for k, v in record.items() if k != "identity"},
        "running": bool(record and alive(record)),
    }


def logs() -> str:
    path = home() / "service.log"
    if not path.is_file():
        return "No startup log yet. Run X-DDE UI."
    with path.open("rb") as file:
        file.seek(max(0, path.stat().st_size - 16000))
        return file.read().decode(errors="replace")


def start(port: int, auto_deploy: bool) -> str:
    with lock():
        record = read_json(home() / "service.json")
        if record and alive(record):
            return f"http://127.0.0.1:{record['port']}/"
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as exc:
                raise RuntimeError(
                    f"Port {port} is in use. Choose --port 4321 or stop its owner."
                ) from exc
        env = dict(os.environ, WB_AUTO_DEPLOY="1" if auto_deploy else "0")
        instance = str(uuid4())
        env["WB_INSTANCE"] = instance
        env["WB_ALLOWED_ORIGINS"] = f"http://127.0.0.1:{port},http://localhost:{port}"
        log_path = home() / "service.log"
        if log_path.exists() and log_path.stat().st_size > 8 * 1024**2:
            log_path.replace(home() / "service.previous.log")
        with log_path.open("ab") as output:
            process = subprocess.Popen(
                [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                env=env,
                cwd=home(),
            )
        record = {"pid": process.pid, "identity": process_identity(process.pid), "port": port}
        atomic_json(home() / "service.json", record)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("UI startup failed. Run xdde logs for details.")
            try:
                if session(port).get("instance") == instance:
                    return f"http://127.0.0.1:{port}/"
            except (OSError, ValueError, urllib.error.URLError):
                time.sleep(0.2)
        if alive(record):
            os.killpg(process.pid, signal.SIGTERM)
        raise TimeoutError("UI did not become ready in 30 seconds. Run xdde logs.")


def stop() -> None:
    with lock():
        record = read_json(home() / "service.json")
        if not record or not alive(record):
            return
        token = session(record["port"])["csrf_token"]
        request = urllib.request.Request(
            f"http://127.0.0.1:{record['port']}/api/lifecycle/stop",
            data=b"{}",
            headers={"Content-Type": "application/json", "X-Workbench-CSRF": token},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as r:
            state = json.load(r)
        if state["busy"]:
            raise RuntimeError(
                "Tasks or deployments are active. Pause/stop them in the panel first."
            )
        if not alive(record):
            return
        os.killpg(record["pid"], signal.SIGTERM)
        for _ in range(100):
            if not alive(record):
                return
            time.sleep(0.1)
        raise RuntimeError("Graceful shutdown is still pending; no forced kill was issued.")
