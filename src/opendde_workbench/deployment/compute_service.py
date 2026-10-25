"""X-DDE owns environment service lifecycle; the native factory owns launch arguments."""

import json
import logging
import os
import subprocess
import threading
import time
from pathlib import Path

from ..locations import atomic_json, read_json
from ..opendde_limits import OpenDDELimits
from .compute_config import read_connection
from .msa_config import msa_endpoint


class ComputeService:
    def __init__(self, state, *, msa_url=None, resource_limits=None):
        self.state = state
        self.msa_url = msa_endpoint(msa_url)
        self.resource_limits = OpenDDELimits.model_validate(
            {} if resource_limits is None else resource_limits
        )
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
            changed = (
                installed.get("compute", {}).get("image") != connection.image
                or installed.get("runtime", {}).get("code") != connection.code
                or connection.msa_url != self.msa_url
            )
            if changed and action == "start":
                # Retire only this instance, with native queue/identity proof, before replacing it.
                self.invoke("retire")
                replacement = connection.model_copy(
                    update={
                        "image": installed["compute"]["image"],
                        "code": installed["runtime"]["code"],
                        "container_id": None,
                        "msa_url": self.msa_url,
                    }
                )
                replacement = type(connection).model_validate(replacement.model_dump())
                atomic_json(self.state / "compute-service.json", replacement.model_dump())
                return self.invoke("start")
            message = {
                "action": action,
                "connection": connection.model_dump(),
                "root": str(root),
                "checkpoint": "opendde_abag.pt" if "abag" in installed else "opendde.pt",
                "resource_limits": self.resource_limits.model_dump(),
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
            try:
                result = subprocess.run(
                    [python, str(Path(__file__).with_name("native_compute_service.py"))],
                    input=json.dumps(message),
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=110 if action == "start" else 25,
                )
            except subprocess.TimeoutExpired:
                raise ValueError(
                    "Compute setup did not finish. "
                    "Check the current service status before retrying."
                ) from None
            if result.returncode:
                raise RuntimeError(
                    "Native service lifecycle failed. Check Docker and the installed environment."
                )
            reply = json.loads(result.stdout)
            if not reply.get("ok"):
                diagnostic = reply.get("diagnostic")
                if isinstance(diagnostic, str):
                    logging.getLogger(__name__).warning(
                        "Native compute %s failed: %s",
                        action,
                        diagnostic[-8000:].replace(connection.token, "[redacted]"),
                    )
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
            if changed:
                reply["result"].update(
                    ready=False,
                    restart_required=True,
                )
                if not reply["result"].get("cleanup_pending"):
                    reply["result"]["reason"] = (
                        "The installed environment changed. Apply its update before new tasks."
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
