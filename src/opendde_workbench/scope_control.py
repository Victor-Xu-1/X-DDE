"""Inspect and stop only an owned native task's entire resource group."""

import json
import os
from pathlib import Path

from .local_scope import control, owned_unit
from .locations import atomic_json


async def unit_state(unit):
    code, output, _ = await control(
        "systemctl",
        "--user",
        "show",
        unit,
        "--property=LoadState",
        "--property=ActiveState",
        "--property=ControlGroup",
        "--property=Result",
        "--property=MemoryPeak",
        "--property=MemoryMax",
        "--property=MemorySwapMax",
        "--property=CPUQuotaPerSecUSec",
        "--property=TasksMax",
        "--property=RuntimeMaxUSec",
    )
    values = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
    if code and values.get("LoadState") != "not-found":
        raise RuntimeError("Task resource cleanup cannot be confirmed; queue must remain paused.")
    return values


def group_path(group, unit):
    if not group.endswith("/" + unit) or f"/user-{os.getuid()}.slice/" not in group:
        raise RuntimeError("Task resource group ownership changed; queue must remain paused.")
    root = (Path("/sys/fs/cgroup") / group.lstrip("/")).resolve()
    if not root.is_relative_to(Path("/sys/fs/cgroup")):
        raise RuntimeError("Invalid task resource group.")
    return root


def kernel_state(root):
    if not root.exists():
        return {"populated": False}
    try:
        events = dict(line.split() for line in (root / "cgroup.events").read_text().splitlines())
        memory = dict(line.split() for line in (root / "memory.events").read_text().splitlines())
    except FileNotFoundError:
        if not root.exists():
            return {"populated": False}
        raise
    peak = root / "memory.peak"
    return {
        "populated": events.get("populated") != "0",
        "memory_events": {key: int(value) for key, value in memory.items()},
        "memory_peak_bytes": int(peak.read_text().strip()) if peak.is_file() else None,
    }


async def stop_scope(directory, data):
    unit = owned_unit(data["scope_unit"], directory)
    closed = directory / "scope-launch-closed.json"
    if closed.is_symlink():
        raise RuntimeError("Task launch closure cannot be a link.")
    if closed.exists() and json.loads(closed.read_text()).get("unit") != unit:
        raise RuntimeError("Task launch ownership changed; queue must remain paused.")
    # Persist intent before querying the manager: a launcher still being created
    # must not start science after cleanup has observed an as-yet absent unit.
    atomic_json(closed, {"unit": unit})
    evidence = data.get("scope")
    if evidence and evidence.get("unit") != unit:
        raise RuntimeError("Task resource evidence differs from its owned launch.")
    state = await unit_state(unit)
    current_group = state.get("ControlGroup", "")
    previous_group = evidence.get("control_group", "") if evidence else ""
    group = current_group or previous_group
    root = group_path(group, unit) if group else None
    if root and root.exists() and evidence and root.stat().st_ino != evidence["cgroup_inode"]:
        raise RuntimeError("Task resource group was replaced; queue must remain paused.")
    before = kernel_state(root) if root else {"populated": False}
    exit_file = directory / "scope-exit.json"
    if not exit_file.exists():
        atomic_json(exit_file, {"unit": unit, "state": state, "kernel": before})
    if state.get("LoadState") == "not-found":
        if before["populated"]:
            raise RuntimeError("An untracked task resource group is still populated.")
        atomic_json(
            directory / "scope-cleanup.json",
            {"unit": unit, "descendants_stopped": True, "other_units_modified": 0},
        )
        return
    if current_group and previous_group and current_group != previous_group:
        raise RuntimeError("Task resource group identity changed; queue must remain paused.")
    code, _, _ = await control("systemctl", "--user", "stop", unit, timeout=20)
    if code:
        raise RuntimeError("Task resource termination is unconfirmed; queue must remain paused.")
    after = await unit_state(unit)
    remaining = kernel_state(root) if root else {"populated": False}
    if after.get("ActiveState") not in {"inactive", "failed"} or remaining["populated"]:
        raise RuntimeError("Native task descendants remain active; queue must remain paused.")
    if after.get("LoadState") != "not-found":
        code, _, _ = await control("systemctl", "--user", "reset-failed", unit)
        if code and (await unit_state(unit)).get("LoadState") != "not-found":
            raise RuntimeError("The completed task resource unit could not be released.")
    atomic_json(
        directory / "scope-cleanup.json",
        {"unit": unit, "descendants_stopped": True, "other_units_modified": 0},
    )


def pending_scope(directory, script):
    config = directory / "scope-config.json"
    if config.is_symlink():
        raise RuntimeError("Scientific resource recovery configuration cannot be a link.")
    if not config.is_file():
        if (directory / "scope-ready.json").exists():
            raise RuntimeError("Scientific resource ownership metadata is incomplete.")
        return None
    value = json.loads(config.read_text())
    if value.get("directory") != str(directory) or value.get("script") != str(script):
        raise RuntimeError("Scientific resource recovery differs from the persisted task.")
    data = {"scope_unit": owned_unit(value["unit"], directory)}
    ready = directory / "scope-ready.json"
    if ready.is_symlink():
        raise RuntimeError("Scientific resource evidence cannot be a link.")
    if ready.is_file():
        evidence = json.loads(ready.read_text())
        if evidence.get("unit") != data["scope_unit"]:
            raise RuntimeError("Scientific resource recovery evidence changed.")
        data["scope"] = evidence
    return data
