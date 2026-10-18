"""Standalone pre-exec guard: verify kernel caps before importing scientific software."""

import json
import os
import re
import sys
from pathlib import Path
from uuid import UUID


def verify_kernel_group(unit, limits):
    membership = Path("/proc/self/cgroup").read_text().splitlines()
    group = next((line[3:] for line in membership if line.startswith("0::")), "")
    if not group.endswith("/" + unit) or f"/user-{os.getuid()}.slice/" not in group:
        raise RuntimeError("Scientific process is outside its owned resource group.")
    root = (Path("/sys/fs/cgroup") / group.lstrip("/")).resolve()
    if not root.is_relative_to(Path("/sys/fs/cgroup")):
        raise RuntimeError("Invalid scientific resource group.")
    values = {
        name: (root / name).read_text().strip()
        for name in ("memory.max", "memory.swap.max", "cpu.max", "pids.max", "memory.oom.group")
    }
    quota, period = values["cpu.max"].split()
    if (
        values["memory.max"] != str(limits["memory_mib"] * 1024**2)
        or values["memory.swap.max"] != "0"
        or values["pids.max"] != str(limits["pids"])
        or values["memory.oom.group"] != "1"
        or quota == "max"
        or int(quota) != int(period) * limits["cpu"]
    ):
        raise RuntimeError(
            "Scientific resource caps were not applied; computation was not started."
        )
    return {
        "unit": unit,
        "control_group": group,
        "cgroup_inode": root.stat().st_ino,
        "kernel_limits": values,
        "native_pid": os.getpid(),
        "native_start_time": Path("/proc/self/stat").read_text().rsplit(")", 1)[1].split()[19],
    }


def main(config_file):
    config_file = Path(config_file)
    if config_file.is_symlink():
        raise RuntimeError("Scientific resource configuration cannot be a link.")
    config = json.loads(config_file.read_text())
    directory = Path(config["directory"]).resolve()
    job_id = str(UUID(directory.name))
    if config_file.resolve().parent != directory or not re.fullmatch(
        rf"xdde-native-{re.escape(job_id)}-[a-f0-9]{{16}}\.scope", config["unit"]
    ):
        raise RuntimeError("Scientific resource group differs from the persisted task.")
    closed = directory / "scope-launch-closed.json"
    if closed.exists() or closed.is_symlink():
        raise RuntimeError("The task launch was closed before scientific execution.")
    evidence = verify_kernel_group(config["unit"], config["limits"])
    evidence["limits"] = config["limits"]
    target = directory / "scope-ready.json"
    temporary = directory / "scope-ready.json.tmp"
    if target.exists() or temporary.exists():
        raise RuntimeError("Preserve the original scientific resource evidence.")
    with temporary.open("x", encoding="utf-8") as stream:
        os.chmod(temporary, 0o600)
        json.dump(evidence, stream)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(target)
    environment = config["environment"]
    if any(key in environment for key in ("DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR")):
        raise RuntimeError(
            "Scientific software must not inherit its resource controller connection."
        )
    if closed.exists() or closed.is_symlink():
        raise RuntimeError("The task launch was closed before scientific execution.")
    os.execve(config["python"], [config["python"], config["script"], str(directory)], environment)


if __name__ == "__main__":
    main(sys.argv[1])
