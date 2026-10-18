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


async def start(python, script, directory, env, *, limits=None):
    unit = None
    arguments = [str(python), str(script), str(directory)]
    if limits is not None:
        from .local_scope import launch

        arguments, env, unit = await launch(python, script, directory, env, limits)
    process = await asyncio.create_subprocess_exec(
        *arguments,
        cwd=directory,
        env=env,
        start_new_session=True,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    identity = None
    try:
        identity = kernel_identity(process.pid)
        record = {"pid": process.pid, "start_time": identity["start_time"], "runner": script.name}
        if unit:
            record["scope_unit"] = unit
        atomic_json(directory / "process.json", record)
        if unit:
            from .local_scope import ready

            record["scope"] = await ready(directory, process, unit)
            atomic_json(directory / "process.json", record)
    except FileNotFoundError:
        await process.wait()
        if unit and (directory / "scope-ready.json").is_file():
            from .local_scope import ready

            proof = await ready(directory, process, unit)
            atomic_json(
                directory / "process.json",
                {
                    "pid": process.pid,
                    "start_time": None,
                    "runner": script.name,
                    "scope_unit": unit,
                    "scope": proof,
                    "pid_exited_before_capture": True,
                },
            )
    except BaseException:
        try:
            if unit:
                from .scope_control import stop_scope

                await stop_scope(directory, {"scope_unit": unit})
        finally:
            try:
                # Scoped startup can wait for the controller. Never signal a
                # process group whose original kernel identity no longer matches.
                current = kernel_identity(process.pid) if unit else None
                if not unit or (
                    process.returncode is None
                    and identity is not None
                    and current["start_time"] == identity["start_time"]
                    and current["group"] == process.pid
                ):
                    os.killpg(process.pid, signal.SIGKILL)
            except (FileNotFoundError, ProcessLookupError):
                pass
            await asyncio.wait_for(process.wait(), 10)
            if unit and process.stdout:
                try:
                    diagnostics = await asyncio.wait_for(process.stdout.read(65536), 3)
                    (directory / "scope-launch.log").write_bytes(diagnostics)
                except (TimeoutError, OSError):
                    pass
        raise
    return process


async def stop(script, directory):
    record = directory / "process.json"
    if not record.is_file():
        from .scope_control import pending_scope, stop_scope

        pending = pending_scope(directory, script)
        if pending:
            await stop_scope(directory, pending)
        return
    data = json.loads(record.read_text())
    pid = data["pid"]
    if not isinstance(pid, int) or pid <= 1 or data["runner"] != script.name:
        raise RuntimeError("Invalid scientific process recovery record; queue must remain paused.")
    if data.get("scope_unit"):
        from .scope_control import stop_scope

        await stop_scope(directory, data)
        record.unlink(missing_ok=True)
        return
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
