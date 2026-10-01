"""Bounded real platform lifecycle for an isolated persisted browser fixture."""

import json
import os
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from urllib.request import urlopen


@contextmanager
def platform(state, log_path):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "WB_STATE_DIR": str(state),
        "WB_AUTO_DEPLOY": "0",
        "WB_ALLOWED_ORIGINS": base,
    }
    with log_path.open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "opendde_workbench", "--port", str(port)],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(40):
                if process.poll() is not None:
                    raise AssertionError("Browser platform exited during startup")
                try:
                    with urlopen(base + "/api/health", timeout=2) as response:
                        if json.load(response)["worker_ready"]:
                            break
                except OSError:
                    pass
                time.sleep(0.2)
            else:
                raise AssertionError("Browser platform did not become ready")
            yield base
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
