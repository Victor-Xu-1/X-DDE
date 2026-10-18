"""Per-task Linux resource groups reuse the existing process/queue authority."""

import asyncio
import json
import os
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from uuid import UUID, uuid4

from .locations import atomic_json


@dataclass(frozen=True)
class ScopeLimits:
    cpu: int = 2
    memory_mib: int = 4096
    pids: int = 256
    runtime_seconds: int = 7200

    def __post_init__(self):
        bounds = {
            "cpu": (1, 16),
            "memory_mib": (32, 65536),
            "pids": (16, 4096),
            "runtime_seconds": (1, 604800),
        }
        if any(
            type(value) is not int or not bounds[key][0] <= value <= bounds[key][1]
            for key, value in asdict(self).items()
        ):
            raise ValueError("Choose a bounded native resource policy.")


def controller_environment():
    if sys.platform != "linux" or not shutil.which("systemd-run") or not shutil.which("systemctl"):
        raise RuntimeError(
            "Prepare the Linux resource-controlled runtime before starting this model."
        )
    runtime = Path(f"/run/user/{os.getuid()}")
    if not (runtime / "bus").is_socket():
        raise RuntimeError(
            "The resource-controlled runtime is unavailable; prepare it in Components."
        )
    controllers = Path("/sys/fs/cgroup/cgroup.controllers")
    if not controllers.is_file() or not {"memory", "cpu", "pids"} <= set(
        controllers.read_text().split()
    ):
        raise RuntimeError("The native runtime requires memory, CPU and process resource controls.")
    return {
        "PATH": "/usr/bin:/bin",
        "HOME": os.environ.get("HOME", str(Path.home())),
        "XDG_RUNTIME_DIR": str(runtime),
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime}/bus",
    }


async def control(*arguments, timeout=10):
    process = await asyncio.create_subprocess_exec(
        *arguments,
        env=controller_environment(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        output, error = await asyncio.wait_for(process.communicate(), timeout)
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    return process.returncode, output.decode(errors="replace"), error.decode(errors="replace")


def owned_unit(unit, directory):
    import re

    identifier = str(UUID(directory.name))
    if not re.fullmatch(rf"xdde-native-{re.escape(identifier)}-[a-f0-9]{{16}}\.scope", unit):
        raise RuntimeError("Unconfirmed task resource ownership; queue must remain paused.")
    return unit


async def launch(python, script, directory, environment, limits):
    controller_environment()  # Fail before scientific execution; there is no unbounded fallback.
    unit = f"xdde-native-{UUID(directory.name)}-{uuid4().hex[:16]}.scope"
    config = directory / "scope-config.json"
    if config.exists() or (directory / "scope-ready.json").exists():
        raise RuntimeError("Preserve the existing scientific launch and resource evidence.")
    atomic_json(
        config,
        {
            "unit": unit,
            "limits": asdict(limits),
            "directory": str(directory),
            "python": str(python),
            "script": str(script),
            "environment": environment,
        },
    )
    code, help_text, _ = await control("systemd-run", "--help")
    if code:
        raise RuntimeError("The resource controller cannot start this scientific task.")
    arguments = [
        "systemd-run",
        "--user",
        "--scope",
        "--quiet",
        "--no-ask-password",
        "--unit=" + unit,
        f"--property=MemoryMax={limits.memory_mib * 1024**2}",
        "--property=MemorySwapMax=0",
        f"--property=CPUQuota={limits.cpu * 100}%",
        f"--property=TasksMax={limits.pids}",
        "--property=OOMPolicy=kill",
        "--property=MemoryAccounting=yes",
        "--property=CPUAccounting=yes",
        f"--property=RuntimeMaxSec={limits.runtime_seconds}",
        "--property=TimeoutStopSec=10s",
        "--property=KillMode=control-group",
    ]
    if "--expand-environment=" in help_text:
        arguments.append("--expand-environment=no")
    arguments.extend(
        ["--", sys.executable, str(Path(__file__).with_name("scope_guard.py")), str(config)]
    )
    return arguments, controller_environment(), unit


async def ready(directory, process, unit):
    target = directory / "scope-ready.json"
    for _ in range(100):
        if target.is_file() and not target.is_symlink():
            value = json.loads(target.read_text())
            if value.get("unit") != owned_unit(unit, directory):
                raise RuntimeError("Scientific resource evidence differs from its owned task.")
            return value
        if process.returncode is not None:
            break
        await asyncio.sleep(0.05)
    raise RuntimeError(
        "Resource caps could not be verified; no unbounded computation is permitted."
    )
