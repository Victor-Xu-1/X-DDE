"""Real owned Docker/host lifecycles in isolated CI; no scientific model execution."""

import asyncio
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench import container_runtime, local_process, prepared_container
from opendde_workbench.docking import backend as docking_backend
from opendde_workbench.engine import command as native_command
from opendde_workbench.receptors.image import PYTHON_IMAGE

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_NATIVE_CONTAINER_STOP") != "1",
    reason="Select the isolated native cancellation gate.",
)

SUPERVISOR = (
    "import subprocess,sys,time\nfrom pathlib import Path\n"
    "child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(90)'])\n"
    "Path('child.pid').write_text(str(child.pid))\n"
    "print('ready',flush=True)\ntime.sleep(90)\n"
)


def owned_container(runtime, name):
    result = runtime.run(
        [
            "docker",
            "create",
            "--name",
            name,
            "--network",
            "none",
            "--read-only",
            "--memory",
            "64m",
            "--cpus",
            "0.1",
            "--pids-limit",
            "16",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            PYTHON_IMAGE,
            "python",
            "-c",
            "import time;time.sleep(90)",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    identifier = result.stdout.strip()
    assert len(identifier) == 64
    return identifier


@pytest.mark.parametrize("kind", ["preparation", "docking"])
@pytest.mark.parametrize("outcome", ["confirmed", "lost_reply", "daemon_unavailable"])
def test_cancel_stops_only_its_process_tree_without_hiding_docker_failure(
    tmp_path, monkeypatch, kind, outcome
):
    directory = tmp_path / str(uuid4())
    directory.mkdir()
    script = directory / "supervise.py"
    script.write_text(SUPERVISOR)
    artifact = directory / "original-artifact.dat"
    artifact.write_bytes(b"unaltered retained native artifact fixture\n")
    artifact_sha = hashlib.sha256(artifact.read_bytes()).hexdigest()
    observed = subprocess.run(
        ["docker", "info", "--format", "{{json .ID}}"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )
    runtime = container_runtime.DockerRuntime(
        "unix:///var/run/docker.sock", json.loads(observed.stdout)
    )
    container_runtime.freeze(directory, runtime)
    receipt_bytes = (directory / container_runtime.RECEIPT).read_bytes()
    settings = SimpleNamespace(state_dir=directory / "state")
    if kind == "preparation":
        module = prepared_container
        backend = module.PreparedContainerBackend(
            settings, "posebusters", directory, ["runner.py"], None, None
        )
    else:
        module = docking_backend
        backend = module.DockingBackend(settings)
    container = owned_container(runtime, backend.container(directory.name))
    sibling = None
    commands = []

    async def execute(*arguments, **options):
        commands.append(arguments)
        assert arguments[:3] == ("docker", "--host", runtime.endpoint)
        if outcome == "daemon_unavailable" and arguments[3] == "info":
            return 1, "controlled unavailable-daemon observation"
        value = await native_command(*arguments, **options)
        if outcome == "lost_reply" and arguments[3] == "rm":
            assert value[0] == 0
            raise TimeoutError("controlled lost reply after real owned removal")
        return value

    monkeypatch.setattr(module, "command", execute)

    async def exercise():
        process = foreign_process = None
        sibling_directory = tmp_path / "preserved-sibling"
        sibling_directory.mkdir()
        sibling_script = sibling_directory / "supervise.py"
        sibling_script.write_text("import time\nprint('ready',flush=True)\ntime.sleep(90)\n")
        try:
            foreign_process = await local_process.start(
                Path(sys.executable), sibling_script, sibling_directory, os.environ.copy()
            )
            assert await asyncio.wait_for(foreign_process.stdout.readline(), 5) == b"ready\n"
            process = await local_process.start(
                Path(sys.executable), script, directory, os.environ.copy()
            )
            assert await asyncio.wait_for(process.stdout.readline(), 5) == b"ready\n"
            child = int((directory / "child.pid").read_text())
            if outcome == "confirmed":
                await backend.stop(directory.name, directory)
                # Repeated recovery remains idempotent on the same frozen daemon.
                await backend.stop(directory.name, directory)
            else:
                expected = TimeoutError if outcome == "lost_reply" else RuntimeError
                with pytest.raises(expected):
                    await backend.stop(directory.name, directory)
            await asyncio.wait_for(process.wait(), 5)
            assert not local_process.group_members(process.pid)
            assert not (directory / "process.json").exists()
            if Path(f"/proc/{child}").exists():
                assert local_process.kernel_identity(child)["state"] == "Z"
            assert foreign_process.returncode is None
            assert (sibling_directory / "process.json").is_file()
            assert hashlib.sha256(artifact.read_bytes()).hexdigest() == artifact_sha
            assert (directory / container_runtime.RECEIPT).read_bytes() == receipt_bytes
        finally:
            await local_process.stop(script, directory)
            await local_process.stop(sibling_script, sibling_directory)
            for current in (process, foreign_process):
                if current is not None:
                    await asyncio.wait_for(current.wait(), 5)

    try:
        sibling = owned_container(runtime, "xdde-lifecycle-sibling-" + str(uuid4()))
        runtime.run(["docker", "start", container], check=True, capture_output=True, timeout=15)
        asyncio.run(exercise())
        preserved = runtime.run(
            ["docker", "inspect", "--format", "{{json .State}}", sibling],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert json.loads(preserved.stdout)["Status"] == "created"
        still_present = runtime.run(
            ["docker", "inspect", "--format", "{{json .State}}", container],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if outcome == "daemon_unavailable":
            assert still_present.returncode == 0
            assert json.loads(still_present.stdout)["Running"]
            assert not any("rm" in call for call in commands)
        else:
            assert still_present.returncode == 1 and "No such" in still_present.stderr
        evidence = Path(os.environ["RUNNER_TEMP"]) / "container-stop" / f"{kind}-{outcome}.json"
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(
            json.dumps(
                {
                    "backend": kind,
                    "outcome": outcome,
                    "host_tree_stopped": True,
                    "container_absent": outcome != "daemon_unavailable",
                    "sibling_preserved": True,
                    "artifact_sha256": artifact_sha,
                    "frozen_runtime_preserved": True,
                    "scientific_jobs_started": 0,
                }
            )
        )
    finally:
        for identifier in (container, sibling):
            if identifier is not None:
                runtime.run(
                    ["docker", "rm", "--force", identifier],
                    check=False,
                    capture_output=True,
                    timeout=20,
                )
