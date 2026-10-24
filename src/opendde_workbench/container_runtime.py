"""Local Docker bindings frozen per installed environment, task and installer operation."""

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .locations import atomic_json

RECEIPT = "container-runtime.json"


def document(path):
    if path.is_symlink() or (path.exists() and path.stat().st_size > 2 * 1024**2):
        raise ValueError("Docker runtime configuration is unsafe or oversized.")
    value = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if not isinstance(value, dict):
        raise ValueError("Docker runtime configuration must be an object.")
    return value


@dataclass(frozen=True)
class DockerRuntime:
    endpoint: str | None = None
    daemon_id: str | None = None

    def __post_init__(self):
        if self.endpoint is None and self.daemon_id is None:
            return
        endpoint = self.endpoint
        if (
            not isinstance(endpoint, str)
            or not re.fullmatch(r"unix:///[A-Za-z0-9_./-]{1,190}", endpoint)
            or ".." in PurePosixPath(endpoint[7:]).parts
            or "//" in endpoint[7:]
            or not isinstance(self.daemon_id, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9:._-]{5,127}", self.daemon_id)
        ):
            raise ValueError("Docker requires a local Unix socket and an exact daemon identity.")

    @classmethod
    def parse(cls, value):
        if value is None:
            return cls()
        if not isinstance(value, dict) or set(value) != {"endpoint", "daemon_id"}:
            raise ValueError("Docker binding requires only endpoint and daemon_id.")
        return cls(**value)

    @property
    def value(self):
        return (
            None
            if self.endpoint is None
            else {"endpoint": self.endpoint, "daemon_id": self.daemon_id}
        )

    def arguments(self, args):
        args = [str(value) for value in args]
        if not args or args[0] != "docker":
            raise ValueError("Docker binding can only wrap the Docker executable.")
        return args if self.endpoint is None else ["docker", "--host", self.endpoint, *args[1:]]

    def confirm(self, output):
        if json.loads(output) != self.daemon_id:
            raise RuntimeError("Docker daemon identity differs from the frozen runtime binding.")

    def require(self):
        if self.endpoint is not None:
            observed = subprocess.run(
                self.arguments(["docker", "info", "--format", "{{json .ID}}"]),
                check=True,
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.confirm(observed.stdout)

    def run(self, args, *, runner=None, **kwargs):
        self.require()
        return (runner or subprocess.run)(self.arguments(args), **kwargs)

    async def command(self, execute, *args, **kwargs):
        if self.endpoint is not None:
            code, output = await execute(
                *self.arguments(["docker", "info", "--format", "{{json .ID}}"]),
                timeout=5,
                separate_stderr=True,
            )
            if code:
                raise RuntimeError("The bound Docker daemon is unavailable.")
            self.confirm(output)
        return await execute(*self.arguments(args), **kwargs)


def installed(settings, identifier):
    state = getattr(settings, "state_dir", None)
    deployment = document(Path(state) / "deployment.json") if state is not None else {}
    if not deployment.get("root"):
        return DockerRuntime()
    record = document(Path(deployment["root"]) / "installed.json").get(identifier, {})
    return DockerRuntime.parse(record.get("container_runtime"))


def configured(root, identifier):
    config = document(root / "container-runtimes.json")
    if not config:
        return DockerRuntime()
    if (
        set(config) != {"schema", "engines"}
        or config["schema"] != 1
        or not isinstance(config["engines"], dict)
    ):
        raise ValueError("Docker environment bindings require schema 1 and an engines mapping.")
    return DockerRuntime.parse(config["engines"].get(identifier))


def read(directory):
    path = directory / RECEIPT
    if not path.exists() and not path.is_symlink():
        return DockerRuntime()
    record = document(path)
    if set(record) != {"schema", "runtime"} or record["schema"] != 1:
        raise ValueError("Frozen Docker runtime receipt is invalid.")
    return DockerRuntime.parse(record["runtime"])


def freeze(directory, runtime):
    if (directory / RECEIPT).exists() or (directory / RECEIPT).is_symlink():
        return read(directory)
    atomic_json(directory / RECEIPT, {"schema": 1, "runtime": runtime.value})
    return runtime


def task(settings, identifier, directory):
    if (directory / RECEIPT).exists() or (directory / RECEIPT).is_symlink():
        return read(directory)
    return freeze(directory, installed(settings, identifier))


def installation(root, identifier, directory):
    if (directory / RECEIPT).exists() or (directory / RECEIPT).is_symlink():
        return read(directory)
    # A legacy operation may still own a container on the original daemon.
    # Never redirect its reconciliation to a newly configured empty daemon.
    runtime = (
        DockerRuntime()
        if (directory / "native-probe.json").exists()
        else configured(root, identifier)
    )
    return freeze(directory, runtime)
