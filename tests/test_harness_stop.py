"""Bounded owned-process cancellation fixtures; no native scientific execution."""

import asyncio
import ctypes
import json
import os
import signal
import sys
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest

from opendde_workbench import harness_process, local_process

pytestmark = pytest.mark.skipif(
    not Path("/proc/self/stat").is_file(), reason="Linux process groups and pidfds"
)


@pytest.fixture
def descendants(settings, tmp_path, monkeypatch):
    settings = replace(settings, harness_python=Path(sys.executable))
    spawn = asyncio.create_subprocess_exec
    monkeypatch.setattr(harness_process, "TERM_TIMEOUT", 0.1, raising=False)
    monkeypatch.setattr(harness_process, "KILL_TIMEOUT", 0.5, raising=False)
    # Adopt only this test's fixture grandchildren, so every child can be reaped.
    libc = ctypes.CDLL(None, use_errno=True)
    previous = ctypes.c_int()
    assert libc.prctl(37, ctypes.byref(previous), 0, 0, 0) == 0
    assert libc.prctl(36, 1, 0, 0, 0) == 0

    @asynccontextmanager
    async def launch(*, leader_exited=False, legacy=False, stripped=False):
        script = tmp_path / "harness_compute.py"
        script.write_text(
            "import os, signal, subprocess, sys, time\nfrom pathlib import Path\n"
            "env = os.environ.copy()\n"
            + (f"env.pop('{harness_process.OWNER_VARIABLE}')\n" if stripped else "")
            + "child = subprocess.Popen([sys.executable, '-c', "
            '"import signal,time; from pathlib import Path; '
            "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
            "Path('ready').write_text('yes'); time.sleep(15)\"], "
            "env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n"
            "Path('child.pid').write_text(str(child.pid))\n"
            "while not Path('exit').exists(): time.sleep(0.01)\n"
        )

        async def controlled_spawn(python, _script, *args, **kwargs):
            return await spawn(python, str(script), *args, **kwargs)

        monkeypatch.setattr(asyncio, "create_subprocess_exec", controlled_spawn)
        process = await harness_process.start(settings, tmp_path)
        child = None
        try:
            for _ in range(200):
                if (tmp_path / "ready").exists():
                    break
                await asyncio.sleep(0.01)
            assert (tmp_path / "ready").exists()
            child = int((tmp_path / "child.pid").read_text())
            assert os.getpgid(child) == process.pid
            record = tmp_path / "process.json"
            if legacy:
                data = json.loads(record.read_text())
                record.write_text(json.dumps({key: data[key] for key in ("pid", "start_time")}))
            if leader_exited:
                (tmp_path / "exit").touch()
                await asyncio.wait_for(process.wait(), 2)
            yield settings, process, child, record
        finally:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            await asyncio.wait_for(process.communicate(), 3)
            if child is not None:
                with suppress(ChildProcessError):
                    os.waitpid(child, 0)
            assert not local_process.group_members(process.pid)

    yield launch
    assert libc.prctl(36, previous.value, 0, 0, 0) == 0


@pytest.mark.parametrize("leader_exited", [False, True])
def test_stop_confirms_term_resistant_descendant_after_leader_exit(descendants, leader_exited):
    async def exercise():
        async with descendants(leader_exited=leader_exited) as (settings, process, _, record):
            started = time.monotonic()
            await asyncio.wait_for(harness_process.stop(settings, record.parent), 2)
            assert time.monotonic() - started < 2
            assert not local_process.group_members(process.pid)
            assert not record.exists()

    asyncio.run(exercise())


def test_legacy_live_leader_cohort_can_be_stopped(descendants):
    async def exercise():
        async with descendants(legacy=True) as (settings, process, _, record):
            await asyncio.wait_for(harness_process.stop(settings, record.parent), 2)
            assert not local_process.group_members(process.pid)
            assert not record.exists()

    asyncio.run(exercise())


@pytest.mark.parametrize("mode", ["legacy_exited", "stripped_marker"])
def test_ambiguous_descendants_retain_recovery_identity(descendants, mode):
    async def exercise():
        async with descendants(
            legacy=mode == "legacy_exited",
            leader_exited=mode == "legacy_exited",
            stripped=mode == "stripped_marker",
        ) as (settings, process, child, record):
            original = record.read_bytes()
            with pytest.raises(RuntimeError, match="ownership is unconfirmed"):
                await asyncio.wait_for(harness_process.stop(settings, record.parent), 2)
            assert record.read_bytes() == original
            assert any(pid == child for pid, _ in local_process.group_members(process.pid))

    asyncio.run(exercise())


@pytest.fixture
def recovery(settings, tmp_path, monkeypatch):
    pid = 34567
    info = {"state": "S", "group": pid, "start_time": "100"}
    data = {"pid": pid, "start_time": "100", "boot_id": "same-boot", "owner": "a" * 32}
    record = tmp_path / "process.json"
    record.write_text(json.dumps(data))
    members = Mock(return_value=[(pid + 1, info)])
    monkeypatch.setattr(local_process, "group_members", members)
    monkeypatch.setattr(local_process, "kernel_identity", Mock(return_value=info.copy()))
    monkeypatch.setattr(harness_process, "boot_id", Mock(return_value="same-boot"))
    monkeypatch.setattr(harness_process, "_has_owner", Mock(return_value=True))
    monkeypatch.setattr(harness_process, "_alive", Mock(return_value=True))
    monkeypatch.setattr(harness_process, "TERM_TIMEOUT", 0)
    monkeypatch.setattr(harness_process, "KILL_TIMEOUT", 0)
    monkeypatch.setattr(os, "getsid", Mock(return_value=pid))
    monkeypatch.setattr(os, "pidfd_open", Mock(side_effect=lambda member: member + 100000))
    close = Mock()
    send = Mock()
    monkeypatch.setattr(os, "close", close)
    monkeypatch.setattr(signal, "pidfd_send_signal", send)
    killpg = Mock(side_effect=AssertionError("Stop must never signal a numeric process group"))
    monkeypatch.setattr(os, "killpg", killpg)
    return settings, record, data, info, members, send, close


def test_deadline_retains_identity_and_closes_pidfds(recovery):
    settings, record, _, _, members, send, close = recovery
    original = record.read_bytes()
    with pytest.raises(RuntimeError, match="termination is unconfirmed"):
        asyncio.run(harness_process.stop(settings, record.parent))
    assert record.read_bytes() == original
    assert [call.args[1] for call in send.call_args_list] == [signal.SIGTERM, signal.SIGKILL]
    assert members.call_count == 3
    close.assert_called_once()


@pytest.mark.parametrize(
    "mismatch", ["session", "group", "age", "leader_reuse", "pidfd_bind_reuse", "marker", "boot"]
)
def test_ownership_mismatches_never_signal(recovery, monkeypatch, mismatch):
    settings, record, data, info, members, send, _ = recovery
    if mismatch == "session":
        monkeypatch.setattr(os, "getsid", Mock(return_value=data["pid"] + 2))
    elif mismatch == "group":
        monkeypatch.setattr(
            local_process, "kernel_identity", Mock(return_value={**info, "group": 2})
        )
    elif mismatch == "age":
        info["start_time"] = "99"
        monkeypatch.setattr(local_process, "kernel_identity", Mock(return_value=info.copy()))
    elif mismatch == "leader_reuse":
        info["start_time"] = "101"
        members.return_value = [(data["pid"], info)]
        monkeypatch.setattr(local_process, "kernel_identity", Mock(return_value=info.copy()))
    elif mismatch == "pidfd_bind_reuse":
        monkeypatch.setattr(
            local_process, "kernel_identity", Mock(return_value={**info, "start_time": "101"})
        )
    elif mismatch == "marker":
        monkeypatch.setattr(harness_process, "_has_owner", Mock(return_value=False))
    else:
        monkeypatch.setattr(harness_process, "boot_id", Mock(return_value="another-boot"))
    original = record.read_bytes()
    with pytest.raises(RuntimeError):
        asyncio.run(harness_process.stop(settings, record.parent))
    send.assert_not_called()
    assert record.read_bytes() == original


@pytest.mark.parametrize("error", [PermissionError("denied"), OSError("no pidfd support")])
def test_pidfd_failures_retain_identity(recovery, monkeypatch, error):
    settings, record, _, _, _, send, _ = recovery
    monkeypatch.setattr(os, "pidfd_open", Mock(side_effect=error))
    with pytest.raises(OSError):
        asyncio.run(harness_process.stop(settings, record.parent))
    send.assert_not_called()
    assert record.exists()


def test_permission_failure_reading_marker_retains_identity(recovery, monkeypatch):
    settings, record, _, _, _, send, _ = recovery
    monkeypatch.setattr(harness_process, "_has_owner", Mock(side_effect=PermissionError("denied")))
    with pytest.raises(PermissionError):
        asyncio.run(harness_process.stop(settings, record.parent))
    send.assert_not_called()
    assert record.exists()


@pytest.mark.parametrize("phase", [signal.SIGTERM, signal.SIGKILL])
def test_signal_exit_race_is_confirmed_by_rescanning(recovery, phase):
    settings, record, _, _, members, send, _ = recovery

    def exit_race(_fd, sig):
        if sig == phase:
            members.return_value = []
            raise ProcessLookupError

    send.side_effect = exit_race
    # One extra scan at the end of the KILL deadline must confirm an exit race.
    asyncio.run(harness_process.stop(settings, record.parent))
    assert not record.exists()


@pytest.mark.parametrize(
    "data",
    [
        {"pid": True, "start_time": "100"},
        {"pid": 1, "start_time": "1"},
        {"pid": "34567", "start_time": "100"},
        [],
        {"pid": 34567, "start_time": "100", "owner": "a" * 32},
    ],
)
def test_invalid_and_partial_records_fail_closed(recovery, data):
    settings, record, _, _, _, send, _ = recovery
    record.write_text(json.dumps(data))
    original = record.read_bytes()
    with pytest.raises(RuntimeError):
        asyncio.run(harness_process.stop(settings, record.parent))
    send.assert_not_called()
    assert record.read_bytes() == original


def test_finished_group_still_checks_remote_dispatch_uncertainty(recovery):
    settings, record, _, _, members, send, _ = recovery
    members.return_value = []
    (record.parent / "fold-dispatch.json").write_text('{"state": "dispatching"}')
    with pytest.raises(RuntimeError, match="Fold submission status is uncertain"):
        asyncio.run(harness_process.stop(settings, record.parent))
    send.assert_not_called()
    assert record.exists()


def test_remote_cancellation_failure_keeps_local_identity(recovery, monkeypatch):
    settings, record, _, _, members, _, _ = recovery
    members.return_value = []
    (record.parent / "remote-fold.json").write_text("{}")
    process = Mock(wait=AsyncMock(return_value=1))
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    with pytest.raises(RuntimeError, match="Remote fold cancellation is unconfirmed"):
        asyncio.run(harness_process.stop(settings, record.parent))
    assert record.exists()
    assert spawn.call_args.args[-1] == "cancel"


def test_empty_legacy_group_completes_without_signalling(recovery, monkeypatch):
    settings, record, data, _, members, send, _ = recovery
    record.write_text(json.dumps({key: data[key] for key in ("pid", "start_time")}))
    members.return_value = []
    monkeypatch.setattr(os, "pidfd_open", Mock(side_effect=ProcessLookupError))
    asyncio.run(harness_process.stop(settings, record.parent))
    send.assert_not_called()
    assert not record.exists()


def test_new_marked_descendant_is_discovered_during_kill_phase(recovery):
    settings, record, data, info, members, send, close = recovery
    members.side_effect = [
        [(data["pid"] + 1, info)],
        [(data["pid"] + 1, info), (data["pid"] + 2, info)],
        [],
    ]
    asyncio.run(harness_process.stop(settings, record.parent))
    assert [call.args for call in send.call_args_list] == [
        (data["pid"] + 100001, signal.SIGTERM),
        (data["pid"] + 100001, signal.SIGKILL),
        (data["pid"] + 100002, signal.SIGKILL),
    ]
    assert close.call_count == 2
    assert not record.exists()


def test_legacy_snapshot_does_not_adopt_later_unknown_members(recovery):
    from contextlib import ExitStack

    _, _, data, info, members, send, _ = recovery
    legacy = {key: data[key] for key in ("pid", "start_time")}
    handles = {(data["pid"] + 1, info["start_time"]): 100001}
    members.return_value = [(data["pid"] + 2, info)]
    with ExitStack() as stack, pytest.raises(RuntimeError, match="Legacy Harness"):
        harness_process._owned_group(legacy, handles, stack)
    send.assert_not_called()


def test_cancellation_during_wait_retains_identity_and_closes_handles(recovery, monkeypatch):
    settings, record, _, _, _, _, close = recovery
    monkeypatch.setattr(harness_process, "TERM_TIMEOUT", 8)
    monkeypatch.setattr(asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(harness_process.stop(settings, record.parent))
    assert record.exists()
    close.assert_called_once()


def test_marker_read_is_exact_and_handles_chunk_boundaries(tmp_path, monkeypatch):
    from io import BytesIO

    owner = "f" * 32
    marker = f"{harness_process.OWNER_VARIABLE}={owner}".encode()
    for payload, expected in [
        (b"UNRELATED=" + b"x" * 4100 + b"\0" + marker + b"\0", True),
        (b"x" * 4080 + b"\0" + marker + b"\0", True),
        (b"PREFIX_" + marker + b"\0", False),
        (b"UNRELATED=" + marker + b"\0", False),
        (marker + b"extra\0", False),
        (marker, True),
        (b"x" * (1024 * 1024) + b"\0" + marker + b"\0", False),
    ]:
        monkeypatch.setattr(Path, "open", Mock(return_value=BytesIO(payload)))
        assert harness_process._has_owner(12345, owner) is expected
