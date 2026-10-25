"""Run native Harness tools in the operator's installed Python environment."""

import asyncio
import json
import os
import select
import signal
from contextlib import ExitStack
from pathlib import Path
from uuid import uuid4

from . import local_process
from .locations import atomic_json

OWNER_VARIABLE = "_X_DDE_HARNESS_OWNER"
TERM_TIMEOUT = 8.0
KILL_TIMEOUT = 1.0


def environment(settings):
    env = os.environ.copy()
    if settings.harness_url:
        env["WB_COMPUTE_URL"] = settings.harness_url
    if settings.harness_token:
        env["WB_COMPUTE_TOKEN"] = settings.harness_token
    if settings.harness_shared_dir:
        env["WB_SHARED_DIR"] = str(settings.harness_shared_dir)
        env["WB_REMOTE_DIR"] = settings.harness_remote_dir or str(settings.harness_shared_dir)
    return env


def start_time(pid):
    # Linux proc start time protects against PID reuse after a service restart.
    return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]


def boot_id():
    return Path("/proc/sys/kernel/random/boot_id").read_text().strip()


async def start(settings, directory):
    if not settings.harness_python or not settings.harness_python.is_file():
        raise ValueError(
            "Configure WB_HARNESS_PYTHON with the installed Harness Python executable."
        )
    from .harness_admission import require_managed_compute

    proof = await require_managed_compute(settings, request_path=directory / "request.json")
    if proof is not None:
        atomic_json(directory / "compute-resource-limits.json", proof)
    owner = uuid4().hex
    boot = boot_id()
    env = environment(settings)
    env[OWNER_VARIABLE] = owner
    process = await asyncio.create_subprocess_exec(
        str(settings.harness_python),
        str(Path(__file__).with_name("harness_compute.py")),
        str(directory),
        env=env,
        cwd=directory,
        start_new_session=True,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        try:
            identity = {
                "pid": process.pid,
                "start_time": start_time(process.pid),
                "boot_id": boot,
                "owner": owner,
            }
        except FileNotFoundError:
            # A process that exits immediately has no descendant workflow to recover.
            await process.wait()
            return process
        atomic_json(directory / "process.json", identity)
    except BaseException:
        # Startup has not handed ownership to the caller; do not leave untracked work.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        # Drain the pipe too: wait() alone can hang when a failed startup filled stdout.
        await process.communicate()
        raise
    return process


def _alive(fd):
    poll = select.poll()
    poll.register(fd, select.POLLIN)
    return not poll.poll(0)


def _has_owner(pid, owner):
    # Inspect only the exact marker, without retaining or logging the environment.
    expected = f"{OWNER_VARIABLE}={owner}".encode()
    with Path(f"/proc/{pid}/environ").open("rb") as stream:
        pending = b""
        for _ in range(256):
            chunk = stream.read(4096)
            if not chunk:
                return pending == expected
            parts = (pending + chunk).split(b"\0")
            if expected in parts[:-1]:
                return True
            # An oversized unrelated variable cannot match; retain only a short suffix.
            pending = parts[-1] if len(parts[-1]) <= len(expected) else b"!"
    return False


def _recovery_data(record):
    data = json.loads(record.read_text())
    if (
        not isinstance(data, dict)
        or type(data.get("pid")) is not int
        or data["pid"] <= 1
        or not isinstance(data.get("start_time"), str)
        or not data["start_time"].isdecimal()
        or int(data["start_time"]) <= 0
    ):
        raise RuntimeError("Invalid Harness recovery identity; cancellation is unconfirmed.")
    if "owner" in data or "boot_id" in data:
        owner = data.get("owner")
        if (
            not isinstance(owner, str)
            or len(owner) != 32
            or any(char not in "0123456789abcdef" for char in owner)
            or data.get("boot_id") != boot_id()
        ):
            raise RuntimeError("Harness recovery ownership changed; cancellation is unconfirmed.")
    return data


def _owned_group(data, handles, stack):
    pid = data["pid"]
    anchor = None
    if "owner" not in data and not handles:
        try:
            anchor = os.pidfd_open(pid)
            stack.callback(os.close, anchor)
            leader = local_process.kernel_identity(pid)
            if (
                leader["start_time"] != data["start_time"]
                or leader["group"] != pid
                or os.getsid(pid) != pid
                or b"harness_compute.py" not in Path(f"/proc/{pid}/cmdline").read_bytes()
            ):
                anchor = None
        except (FileNotFoundError, ProcessLookupError):
            anchor = None
    members = local_process.group_members(pid)
    opened = []
    for member, info in members:
        key = (member, info["start_time"])
        try:
            if key not in handles:
                fd = os.pidfd_open(member)
                stack.callback(os.close, fd)
            else:
                fd = handles[key]
            current = local_process.kernel_identity(member)
            if not _alive(fd):
                continue
            if (
                current["start_time"] != info["start_time"]
                or current["group"] != pid
                or os.getsid(member) != pid
            ):
                raise RuntimeError("Harness process group ownership is unconfirmed.")
            if int(info["start_time"]) < int(data["start_time"]):
                raise RuntimeError("Harness process group contains an unexpected process.")
            if member == pid and info["start_time"] != data["start_time"]:
                raise RuntimeError("Harness process identity changed; cancellation is unconfirmed.")
            if (
                member == pid
                and b"harness_compute.py" not in Path(f"/proc/{pid}/cmdline").read_bytes()
                and _alive(fd)
            ):
                raise RuntimeError("Harness process command changed; cancellation is unconfirmed.")
            if "owner" in data and not _has_owner(member, data["owner"]):
                if not _alive(fd):
                    continue
                raise RuntimeError("Harness descendant ownership is unconfirmed.")
            opened.append((key, fd))
        except (FileNotFoundError, ProcessLookupError):
            continue
    if opened and "owner" not in data:
        # Legacy records can adopt one cohort only while the original leader is
        # still alive after capture. Never infer ownership from member age alone.
        if not handles:
            verified = anchor is not None and _alive(anchor)
        else:
            verified = all(key in handles for key, _ in opened)
        if not verified:
            raise RuntimeError(
                "Legacy Harness group ownership is unconfirmed; queue must remain paused."
            )
    # Bind signalling to these kernel processes, never a possibly recycled PGID.
    handles.update(opened)
    return opened


async def stop(settings, directory):
    record = directory / "process.json"
    if not record.is_file():
        await cancel_unfinished_fold(settings, directory)
        return
    data = _recovery_data(record)
    handles = {}
    loop = asyncio.get_running_loop()
    with ExitStack() as stack:
        for sig, timeout, interval in (
            (signal.SIGTERM, TERM_TIMEOUT, 0.2),
            (signal.SIGKILL, KILL_TIMEOUT, 0.1),
        ):
            deadline = loop.time() + timeout
            signalled = set()
            while True:
                members = _owned_group(data, handles, stack)
                if not members and not local_process.group_members(data["pid"]):
                    await cancel_unfinished_fold(settings, directory)
                    record.unlink(missing_ok=True)
                    return
                for key, fd in members:
                    if key not in signalled:
                        try:
                            signal.pidfd_send_signal(fd, sig)
                        except ProcessLookupError:
                            pass
                        signalled.add(key)
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                await asyncio.sleep(min(interval, remaining))
        # A final rescan also confirms an exit racing with the last signal/deadline.
        if not local_process.group_members(data["pid"]):
            await cancel_unfinished_fold(settings, directory)
            record.unlink(missing_ok=True)
            return
    raise RuntimeError("Harness process termination is unconfirmed; queue must remain paused.")


async def cancel_unfinished_fold(settings, directory):
    dispatch = directory / "fold-dispatch.json"
    if (
        dispatch.is_file()
        and json.loads(dispatch.read_text()).get("state") == "dispatching"
        and not (directory / "remote-fold.json").is_file()
    ):
        raise RuntimeError(
            "Fold submission status is uncertain. "
            "Inspect native compute before retrying or resuming the queue."
        )
    if (
        not (directory / "remote-fold.json").is_file()
        or (directory / "output/result.json").is_file()
    ):
        return
    process = await asyncio.create_subprocess_exec(
        str(settings.harness_python),
        str(Path(__file__).with_name("harness_compute.py")),
        str(directory),
        "cancel",
        env=environment(settings),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        code = await asyncio.wait_for(process.wait(), 8)
    except BaseException:
        process.kill()
        await process.wait()
        raise
    if code:
        raise RuntimeError(
            "Remote fold cancellation is unconfirmed. "
            "Inspect the native job before resuming the queue."
        )
