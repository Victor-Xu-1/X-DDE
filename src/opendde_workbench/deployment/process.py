"""Interruptible, bounded installer processes with durable process identity."""

import os
import signal
import subprocess
import time
from pathlib import Path

from ..locations import atomic_json, read_json
from .network import build_command


class Paused(Exception):
    pass


def identity(pid):
    return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]


def reap(path: Path):
    record = read_json(path)
    if record:
        try:
            if identity(record["pid"]) == record["start"]:
                os.killpg(record["pid"], signal.SIGTERM)
                time.sleep(0.2)
                if identity(record["pid"]) == record["start"]:
                    os.killpg(record["pid"], signal.SIGKILL)
        except (ProcessLookupError, FileNotFoundError):
            pass
    path.unlink(missing_ok=True)


def run(args, directory: Path, checkpoint, report, *, timeout=3600, env=None):
    environment = os.environ.copy() if env is None else dict(env)
    args = build_command(args, environment)
    directory.mkdir(parents=True, exist_ok=True)
    pidfile = directory / "process.json"
    log = directory / "install.log"
    with log.open("wb") as output:
        process = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=environment,
        )
        try:
            atomic_json(pidfile, {"pid": process.pid, "start": identity(process.pid)})
            deadline = time.monotonic() + timeout
            while process.poll() is None:
                checkpoint()
                if time.monotonic() >= deadline:
                    raise TimeoutError("Installer timed out. Retry when the network is available.")
                if log.stat().st_size > 8 * 1024**2:
                    raise RuntimeError(
                        "Installer output exceeded 8 MiB; inspect the deployment log."
                    )
                time.sleep(0.25)
            data = log.read_text(errors="replace")
            if process.returncode:
                # UI gets a concise diagnosis; private local log retains command output.
                raise RuntimeError(
                    f"{Path(args[0]).name} exited with code {process.returncode}. "
                    "Check the deployment log, network and prerequisites, then retry."
                )
            return data
        finally:
            if process.poll() is None:
                reap(pidfile)
            process.wait()
            pidfile.unlink(missing_ok=True)
