"""Bounded local scientific processes with durable kernel identities and safe recovery."""

import asyncio
import json
import os
import signal
from pathlib import Path

from .locations import atomic_json


def kernel_identity(pid):
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return {"state": fields[0], "group": int(fields[2]), "start_time": fields[19]}


def group_members(group):
    result = []
    for item in Path("/proc").iterdir():
        if not item.name.isdecimal():
            continue
        try:
            identity = kernel_identity(int(item.name))
            if identity["group"] == group and identity["state"] != "Z":
                result.append((int(item.name), identity))
        except (FileNotFoundError, ProcessLookupError):
            continue
    return result


async def start(python, script, directory, env):
    process = await asyncio.create_subprocess_exec(
        str(python),
        str(script),
        str(directory),
        cwd=directory,
        env=env,
        start_new_session=True,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        identity = kernel_identity(process.pid)
        atomic_json(
            directory / "process.json",
            {"pid": process.pid, "start_time": identity["start_time"], "runner": script.name},
        )
    except FileNotFoundError:
        await process.wait()
    except BaseException:
        os.killpg(process.pid, signal.SIGKILL)
        await process.wait()
        raise
    return process


async def stop(script, directory):
    record = directory / "process.json"
    if not record.is_file():
        return
    data = json.loads(record.read_text())
    pid = data["pid"]
    if not isinstance(pid, int) or pid <= 1 or data["runner"] != script.name:
        raise RuntimeError("Invalid scientific process recovery record; queue must remain paused.")
    try:
        identity = kernel_identity(pid)
    except FileNotFoundError:
        identity = None
    if identity is not None and identity["start_time"] != data["start_time"]:
        # Never signal a reused PID. A remaining group with the reused identifier is uncertain.
        if group_members(pid):
            raise RuntimeError("Scientific process identity changed; cancellation is unconfirmed.")
        record.unlink()
        return
    members = group_members(pid)
    if members:
        if identity is not None and identity["group"] != pid:
            raise RuntimeError("Scientific process no longer owns its recorded process group.")
        if any(int(info["start_time"]) < int(data["start_time"]) for _, info in members):
            raise RuntimeError("Scientific process group contains an unexpected process.")
        try:
            os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        for _ in range(40):
            if not group_members(pid):
                break
            await asyncio.sleep(0.2)
        if group_members(pid):
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            for _ in range(10):
                if not group_members(pid):
                    break
                await asyncio.sleep(0.1)
        if group_members(pid):
            raise RuntimeError(
                "Scientific process termination is unconfirmed; queue must remain paused."
            )
    record.unlink(missing_ok=True)
