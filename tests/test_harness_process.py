"""Harmless child processes verify Harness startup ownership, not scientific work."""

import asyncio
import errno
import json
import os
import signal
import sys
from contextlib import asynccontextmanager, suppress
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest

from opendde_workbench import harness_process, local_process

pytestmark = pytest.mark.skipif(
    not Path("/proc/self/stat").is_file(), reason="Linux process groups"
)


@pytest.fixture
def controlled_harness(settings, tmp_path, monkeypatch):
    settings = replace(settings, harness_python=Path(sys.executable))
    create_subprocess = asyncio.create_subprocess_exec

    @asynccontextmanager
    async def launch(*, exited=False, noisy=False):
        script = tmp_path / "harness_compute.py"
        script.write_text(
            "raise SystemExit(0)\n"
            if exited
            else (
                "import subprocess, sys, time\n"
                "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
                "print(child.pid, flush=True)\n"
                + ("print('x' * 1048576, flush=True)\n" if noisy else "")
                + "time.sleep(60)\n"
            )
        )
        processes = []

        async def spawn(python, _script, *args, **kwargs):
            process = await create_subprocess(python, str(script), *args, **kwargs)
            processes.append(process)
            if exited:
                await asyncio.wait_for(process.communicate(), 5)
            else:
                child = int(await asyncio.wait_for(process.stdout.readline(), 5))
                assert os.getpgid(child) == process.pid
                if noisy:
                    await asyncio.sleep(0.1)
            return process

        monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
        try:
            yield settings, processes
        finally:
            for process in processes:
                with suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
                await asyncio.wait_for(process.communicate(), 5)

    return launch


async def assert_group_stopped(process):
    assert process.returncode is not None
    # Descendants can briefly remain as zombies until the system reaps them.
    for _ in range(100):
        if not local_process.group_members(process.pid):
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Harness startup left a live process group")


@pytest.mark.parametrize("error_number", [errno.ENOSPC, errno.EACCES, errno.ENOENT])
def test_identity_write_failure_stops_parent_and_descendants(
    controlled_harness, tmp_path, monkeypatch, error_number
):
    error = OSError(error_number, "controlled identity write failure")
    open_path = Path.open

    def fail_identity_open(path, *args, **kwargs):
        if path.name == "process.json" or path.name.startswith(".process.json-"):
            raise error
        return open_path(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fail_identity_open)

    async def exercise():
        async with controlled_harness() as (settings, processes):
            with pytest.raises(OSError) as raised:
                await asyncio.wait_for(harness_process.start(settings, tmp_path), 5)
            assert raised.value is error
            await assert_group_stopped(processes[0])
            assert not (tmp_path / "process.json").exists()
            assert not list(tmp_path.glob(".process.json-*.tmp"))

    asyncio.run(exercise())


def test_identity_capture_failure_stops_parent_and_descendants(
    controlled_harness, tmp_path, monkeypatch
):
    error = PermissionError("controlled kernel identity failure")
    monkeypatch.setattr(harness_process, "start_time", Mock(side_effect=error))

    async def exercise():
        async with controlled_harness() as (settings, processes):
            with pytest.raises(PermissionError) as raised:
                await asyncio.wait_for(harness_process.start(settings, tmp_path), 5)
            assert raised.value is error
            await assert_group_stopped(processes[0])
            assert not (tmp_path / "process.json").exists()

    asyncio.run(exercise())


def test_failed_atomic_identity_preserves_previous_record_and_drains_stdout(
    controlled_harness, tmp_path, monkeypatch
):
    record = tmp_path / "process.json"
    original = '{"pid": 1, "start_time": "previous"}'
    record.write_text(original)
    error = OSError(errno.ENOSPC, "controlled identity flush failure")
    monkeypatch.setattr(os, "fsync", Mock(side_effect=error))

    async def exercise():
        async with controlled_harness(noisy=True) as (settings, processes):
            with pytest.raises(OSError) as raised:
                await asyncio.wait_for(harness_process.start(settings, tmp_path), 5)
            assert raised.value is error
            await assert_group_stopped(processes[0])
            assert record.read_text() == original
            assert not list(tmp_path.glob(".process.json-*.tmp"))

    asyncio.run(exercise())


def test_normal_start_persists_identity_and_preserves_stop(controlled_harness, tmp_path):
    async def exercise():
        async with controlled_harness() as (settings, processes):
            process = await asyncio.wait_for(harness_process.start(settings, tmp_path), 5)
            assert process is processes[0]
            assert process.returncode is None
            identity = json.loads((tmp_path / "process.json").read_text())
            assert len(identity["owner"]) == 32
            assert identity == {
                "pid": process.pid,
                "start_time": harness_process.start_time(process.pid),
                "boot_id": harness_process.boot_id(),
                "owner": identity["owner"],
            }
            await asyncio.wait_for(harness_process.stop(settings, tmp_path), 10)
            await asyncio.wait_for(process.communicate(), 5)
            await assert_group_stopped(process)
            assert not (tmp_path / "process.json").exists()

    asyncio.run(exercise())


def test_immediately_exited_child_is_still_returned(controlled_harness, tmp_path):
    async def exercise():
        async with controlled_harness(exited=True) as (settings, processes):
            process = await asyncio.wait_for(harness_process.start(settings, tmp_path), 5)
            assert process is processes[0]
            assert process.returncode == 0
            assert not (tmp_path / "process.json").exists()

    asyncio.run(exercise())


def test_cleanup_exit_race_preserves_original_error(settings, tmp_path, monkeypatch):
    settings = replace(settings, harness_python=Path(sys.executable))
    process = Mock(pid=12345, communicate=AsyncMock(return_value=(b"", None)))
    error = OSError(errno.ENOSPC, "controlled identity write failure")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=process))
    monkeypatch.setattr(harness_process, "start_time", Mock(return_value="123"))
    monkeypatch.setattr(harness_process, "atomic_json", Mock(side_effect=error))
    kill_group = Mock(side_effect=ProcessLookupError)
    monkeypatch.setattr(os, "killpg", kill_group)

    with pytest.raises(OSError) as raised:
        asyncio.run(harness_process.start(settings, tmp_path))

    assert raised.value is error
    kill_group.assert_called_once_with(process.pid, signal.SIGKILL)
    process.communicate.assert_awaited_once()
