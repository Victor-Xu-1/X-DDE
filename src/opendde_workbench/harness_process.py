"""Run native Harness tools in the operator's installed Python environment."""

import asyncio
import json
import os
import signal
from pathlib import Path


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


async def start(settings, directory):
    if not settings.harness_python or not settings.harness_python.is_file():
        raise ValueError(
            "Configure WB_HARNESS_PYTHON with the installed Harness Python executable."
        )
    process = await asyncio.create_subprocess_exec(
        str(settings.harness_python),
        str(Path(__file__).with_name("harness_compute.py")),
        str(directory),
        env=environment(settings),
        cwd=directory,
        start_new_session=True,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        identity = {"pid": process.pid, "start_time": start_time(process.pid)}
        (directory / "process.json").write_text(json.dumps(identity))
    except FileNotFoundError:
        # A process that exits immediately has no descendant workflow to recover.
        await process.wait()
    return process


async def stop(settings, directory):
    identity = directory / "process.json"
    if not identity.is_file():
        await cancel_unfinished_fold(settings, directory)
        return
    data = json.loads(identity.read_text())
    pid = int(data["pid"])

    def matches():
        try:
            return (
                start_time(pid) == data["start_time"]
                and b"harness_compute.py" in Path(f"/proc/{pid}/cmdline").read_bytes()
            )
        except FileNotFoundError:
            return False

    if matches():
        os.killpg(pid, signal.SIGTERM)
        for _ in range(40):
            if not matches():
                break
            await asyncio.sleep(0.2)
        if matches():
            os.killpg(pid, signal.SIGKILL)
    identity.unlink(missing_ok=True)
    await cancel_unfinished_fold(settings, directory)


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
