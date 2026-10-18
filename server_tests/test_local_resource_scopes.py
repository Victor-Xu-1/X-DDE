"""Real kernel resource limits and cleanup, using tiny scripts rather than science."""

import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench import local_process, local_scope, scope_control
from opendde_workbench.local_scope import ScopeLimits, controller_environment

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_NATIVE_LOCAL_SCOPE") != "1",
    reason="Select the native resource-control gate.",
)


def study_directory(tmp_path, body):
    controller_environment()
    directory = tmp_path / str(uuid4())
    directory.mkdir()
    script = directory / "controlled_runner.py"
    script.write_text(body)
    return directory, script


def keep_evidence(name, directory):
    target = Path(__file__).parent / "evidence/local-resource-scopes" / name
    target.mkdir(parents=True, exist_ok=True)
    for file in (
        "scope-ready.json",
        "scope-exit.json",
        "scope-cleanup.json",
        "scope-launch-closed.json",
    ):
        if (directory / file).is_file():
            shutil.copyfile(directory / file, target / file)
    (target / "scope.json").write_text(
        json.dumps(
            {
                "scientific_models_loaded": 0,
                "new_scientific_jobs": 0,
                "scope": "kernel resource control lifecycle only",
            }
        )
    )


async def start(directory, script, **options):
    environment = {"HOME": str(directory), "PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"}
    return await local_process.start(
        Path(sys.executable), script, directory, environment, limits=ScopeLimits(**options)
    )


def test_real_caps_and_detached_descendants_are_cancelled_together(tmp_path):
    directory, script = study_directory(
        tmp_path,
        "import os,subprocess,sys,time\nfrom pathlib import Path\n"
        "assert 'DBUS_SESSION_BUS_ADDRESS' not in os.environ\n"
        "p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],"
        "start_new_session=True)\n"
        "Path('child.pid').write_text(str(p.pid))\nprint('ready',flush=True)\ntime.sleep(60)\n",
    )

    async def exercise():
        process = await start(directory, script, memory_mib=128, pids=64, runtime_seconds=20)
        assert await asyncio.wait_for(process.stdout.readline(), 8) == b"ready\n"
        proof = json.loads((directory / "scope-ready.json").read_text())
        assert proof["kernel_limits"]["memory.max"] == str(128 * 1024**2)
        assert proof["kernel_limits"]["memory.oom.group"] == "1"
        child = int((directory / "child.pid").read_text())
        assert local_process.kernel_identity(child)["group"] == child
        await local_process.stop(script, directory)
        await asyncio.wait_for(process.wait(), 8)
        assert (
            not Path("/proc", str(child)).exists()
            or local_process.kernel_identity(child)["state"] == "Z"
        )
        assert json.loads((directory / "scope-cleanup.json").read_text())["descendants_stopped"]
        assert not (directory / "process.json").exists()
        keep_evidence("detached-descendants", directory)

    asyncio.run(exercise())


def test_real_memory_overrun_stops_only_its_small_owned_cgroup(tmp_path):
    directory, script = study_directory(
        tmp_path, "payload=bytearray(128*1024**2)\nprint('unexpected')\n"
    )

    async def exercise():
        process = await start(directory, script, cpu=1, memory_mib=64, pids=64, runtime_seconds=10)
        assert await asyncio.wait_for(process.wait(), 10) != 0
        await local_process.stop(script, directory)
        evidence = json.loads((directory / "scope-exit.json").read_text())
        assert evidence["state"]["Result"] == "oom-kill", evidence
        if "memory_events" in evidence["kernel"]:
            assert evidence["kernel"]["memory_events"]["oom_kill"] >= 1
        assert evidence["state"]["MemoryMax"] == str(64 * 1024**2)
        assert not (directory / "process.json").exists()
        keep_evidence("bounded-memory-overrun", directory)

    asyncio.run(exercise())


def test_launch_gap_recovery_retains_and_stops_the_owned_scope(tmp_path):
    directory, script = study_directory(
        tmp_path, "import time\nprint('ready',flush=True)\ntime.sleep(60)\n"
    )

    async def exercise():
        process = await start(directory, script, memory_mib=128, runtime_seconds=20)
        assert await asyncio.wait_for(process.stdout.readline(), 8) == b"ready\n"
        (
            directory / "process.json"
        ).unlink()  # Controlled lost-PID receipt, not user/scientific data.
        await local_process.stop(script, directory)
        await asyncio.wait_for(process.wait(), 8)
        assert (
            json.loads((directory / "scope-cleanup.json").read_text())["other_units_modified"] == 0
        )
        keep_evidence("launch-gap-recovery", directory)

    asyncio.run(exercise())


def test_native_wall_time_survives_without_a_worker_watchdog(tmp_path):
    directory, script = study_directory(tmp_path, "import time\ntime.sleep(60)\n")

    async def exercise():
        process = await start(directory, script, memory_mib=128, runtime_seconds=1)
        assert await asyncio.wait_for(process.wait(), 8) != 0
        await local_process.stop(script, directory)
        evidence = json.loads((directory / "scope-exit.json").read_text())
        assert evidence["state"]["Result"] == "timeout", evidence
        keep_evidence("wall-time", directory)

    asyncio.run(exercise())


def test_late_launcher_cannot_start_science_after_cleanup(tmp_path):
    directory, script = study_directory(
        tmp_path, "from pathlib import Path\nPath('science-started.txt').write_text('unexpected')\n"
    )

    async def exercise():
        arguments, environment, unit = await local_scope.launch(
            Path(sys.executable),
            script,
            directory,
            {"HOME": str(directory), "PATH": "/usr/bin:/bin"},
            ScopeLimits(memory_mib=128, runtime_seconds=10),
        )
        await scope_control.stop_scope(directory, {"scope_unit": unit})
        # Real delayed process creation after the cancellation/recovery boundary.
        process = await asyncio.create_subprocess_exec(
            *arguments,
            cwd=directory,
            env=environment,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await asyncio.wait_for(process.communicate(), 8)
        (directory / "scope-launch.log").write_bytes(output)
        assert process.returncode != 0
        assert not (directory / "science-started.txt").exists()
        assert b"launch was closed" in output
        await scope_control.stop_scope(directory, {"scope_unit": unit})
        keep_evidence("late-launch-fence", directory)

    asyncio.run(exercise())
