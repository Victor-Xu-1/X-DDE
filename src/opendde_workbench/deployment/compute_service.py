"""X-DDE owns environment service lifecycle; the native factory owns launch arguments."""

import json
import os
import subprocess
import threading
import time
from pathlib import Path

from ..locations import atomic_json, read_json
from .compute_config import read_connection


class ComputeService:
    def __init__(self, state):
        self.state = state
        self.lock = threading.RLock()
        self.cached = (0.0, {"configured": False, "running": False, "ready": False})

    def invoke(self, action):
        with self.lock:
            connection = read_connection(self.state)
            if connection is None:
                return {
                    "configured": False,
                    "running": False,
                    "ready": False,
                    "reason": "Install Harness, runtime, compute image and a checkpoint; "
                    "then restart X-DDE.",
                }
            deployment = read_json(self.state / "deployment.json")
            root = Path(deployment["root"])
            installed = read_json(root / "installed.json")
            python = installed.get("harness", {}).get("python")
            if not python or not Path(python).is_file():
                raise ValueError("The managed Harness interpreter is unavailable.")
            if (
                installed.get("compute", {}).get("image") != connection.image
                or installed.get("runtime", {}).get("code") != connection.code
            ):
                raise ValueError(
                    "The installed native environment changed; "
                    "stop and reconfigure its service before starting."
                )
            message = {
                "action": action,
                "connection": connection.model_dump(),
                "root": str(root),
                "checkpoint": "opendde_abag.pt" if "abag" in installed else "opendde.pt",
            }
            env = {
                key: value
                for key, value in os.environ.items()
                if key
                in {
                    "PATH",
                    "HOME",
                    "LANG",
                    "TMPDIR",
                    "HTTP_PROXY",
                    "HTTPS_PROXY",
                    "NO_PROXY",
                    "http_proxy",
                    "https_proxy",
                    "no_proxy",
                    "CUDA_VISIBLE_DEVICES",
                }
            }
            result = subprocess.run(
                [python, str(Path(__file__).with_name("native_compute_service.py"))],
                input=json.dumps(message),
                capture_output=True,
                text=True,
                env=env,
                timeout=110 if action == "start" else 25,
            )
            if result.returncode:
                raise RuntimeError(
                    "Native service lifecycle failed. Check Docker and the installed environment."
                )
            reply = json.loads(result.stdout)
            if not reply.get("ok"):
                raise ValueError(
                    str(reply.get("error", "Native service operation failed.")).replace(
                        connection.token, "[redacted]"
                    )
                )
            if action in {"start", "stop"}:
                atomic_json(
                    self.state / "compute-service.json",
                    connection.model_copy(update={"automatic": action == "start"}).model_dump(),
                )
            status = {
                "configured": True,
                "automatic": action == "start" if action != "status" else connection.automatic,
                **reply["result"],
            }
            self.cached = (time.monotonic() + 10, status)
            return status

    def snapshot(self):
        if time.monotonic() < self.cached[0]:
            return self.cached[1]
        try:
            return self.invoke("status")
        except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as exc:
            return {
                "configured": (self.state / "compute-service.json").exists(),
                "running": False,
                "ready": False,
                "reason": str(exc),
            }

    def ensure(self):
        connection = read_connection(self.state)
        if connection is not None and connection.automatic:
            return self.invoke("start")
        return self.snapshot()
