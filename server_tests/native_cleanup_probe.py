"""Real Docker exit/artifact evidence with controlled lost cleanup observations in CI."""

import argparse
import hashlib
import json
import os
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from opendde_workbench.container_runtime import DockerRuntime, freeze, prepare
from opendde_workbench.container_supervision import attach
from opendde_workbench.locations import atomic_json
from opendde_workbench.native_runtime_leases import FILE, entry_digest
from opendde_workbench.receptors.image import PYTHON_IMAGE


def lost_cleanup_observations(run, delayed, commands):
    removed, lost_reads = False, 0

    def controlled(arguments, **kwargs):
        nonlocal removed, lost_reads
        commands.append(arguments)
        value = run(arguments, **kwargs)
        # Execute real calls before injecting lost replies; positive absence,
        # program output and exit status are always read from the real daemon.
        command = arguments[3] if arguments[1:2] == ["--host"] else arguments[1]
        if delayed and command == "rm":
            removed = True
            raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
        if delayed and removed and command == "inspect" and lost_reads < 2:
            lost_reads += 1
            raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
        return value

    return controlled


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bind-local-daemon", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    assert output.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    output.mkdir(parents=True, exist_ok=False)
    run = subprocess.run
    runtime = DockerRuntime()
    if args.bind_local_daemon:
        observed = run(
            ["docker", "info", "--format", "{{json .ID}}"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        runtime = DockerRuntime("unix:///var/run/docker.sock", json.loads(observed.stdout))
    run(["docker", "pull", PYTHON_IMAGE], check=True, timeout=180)
    sibling = "xdde-reinvent-" + str(uuid4())
    run(
        ["docker", "create", "--name", sibling, PYTHON_IMAGE, "python", "-c", "pass"],
        check=True,
        capture_output=True,
        timeout=20,
    )
    settings = SimpleNamespace(state_dir=output / "state")
    components = output / "components"
    entry = {"image": PYTHON_IMAGE}
    atomic_json(settings.state_dir / "deployment.json", {"root": str(components)})
    atomic_json(components / "installed.json", {"reinvent": entry})
    installed_bytes = (components / "installed.json").read_bytes()
    cases = []
    try:
        for delayed, code in ((False, 0), (True, 0), (True, 7)):
            directory = output / str(uuid4())
            directory.mkdir()
            if args.bind_local_daemon:
                now = datetime.now(UTC)
                atomic_json(
                    settings.state_dir / FILE,
                    {
                        "schema": 1,
                        "owner": "X-DDE",
                        "id": str(uuid4()),
                        "created_at": (now - timedelta(seconds=1)).isoformat(),
                        "expires_at": (now + timedelta(minutes=5)).isoformat(),
                        "engines": {
                            "reinvent": {
                                "image": PYTHON_IMAGE,
                                "source_image": PYTHON_IMAGE,
                                "source_entry_sha256": entry_digest(entry),
                                "container_runtime": runtime.value,
                            }
                        },
                    },
                )
                selected_image, selected_runtime = prepare(
                    settings, "reinvent", directory, PYTHON_IMAGE
                )
                assert selected_image == PYTHON_IMAGE and selected_runtime == runtime
                (settings.state_dir / FILE).unlink()
            else:
                freeze(directory, runtime)
            name = "xdde-reinvent-" + directory.name
            artifact = directory / "native-output.txt"
            runtime.run(
                [
                    "docker",
                    "create",
                    "--name",
                    name,
                    "--network",
                    "none",
                    "--read-only",
                    "--user",
                    f"{os.getuid()}:{os.getgid()}",
                    "--memory",
                    "128m",
                    "--cpus",
                    "1",
                    "--pids-limit",
                    "32",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges",
                    "--mount",
                    f"type=bind,source={directory},target=/output",
                    PYTHON_IMAGE,
                    "python",
                    "-c",
                    "from pathlib import Path; "
                    "Path('/output/native-output.txt').write_text('original native artifact'); "
                    f"raise SystemExit({code})",
                ],
                check=True,
                capture_output=True,
                timeout=20,
            )
            commands = []
            controlled = lost_cleanup_observations(run, delayed, commands)

            try:
                with patch("opendde_workbench.native_container_cleanup.subprocess.run", controlled):
                    if code:
                        try:
                            attach(directory, "xdde-reinvent-")
                        except RuntimeError as error:
                            assert "did not finish successfully" in str(error)
                        else:
                            raise AssertionError("Cleanup overrode a failed native program")
                    else:
                        attach(directory, "xdde-reinvent-")
                state = json.loads((directory / "native-exit.json").read_text())
                cleanup = json.loads((directory / "native-cleanup.json").read_text())
                assert (components / "installed.json").read_bytes() == installed_bytes
                assert not (components / "container-runtimes.json").exists()
                assert not (settings.state_dir / FILE).exists()
                assert state["ExitCode"] == code and not state["Running"] and not state["OOMKilled"]
                assert cleanup["state"] == "removed"
                assert artifact.read_text() == "original native artifact"
                assert (
                    sum(
                        (command[3] if command[1:2] == ["--host"] else command[1]) == "start"
                        for command in commands
                    )
                    == 1
                )
                assert (
                    sum(
                        (command[3] if command[1:2] == ["--host"] else command[1]) == "rm"
                        for command in commands
                    )
                    == 1
                )
                assert all(
                    name in command
                    for command in commands
                    if (command[3] if command[1:2] == ["--host"] else command[1]) != "info"
                )
                if args.bind_local_daemon:
                    assert all(
                        command[:3] == ["docker", "--host", runtime.endpoint]
                        for command in commands
                    )
                    assert cleanup["container_runtime"] == runtime.value
                sibling_id = run(
                    ["docker", "inspect", "--format", "{{.Id}}", sibling],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=15,
                ).stdout.strip()
                assert len(sibling_id) == 64
                cases.append(
                    {
                        "task": directory.name,
                        "lost_observations": delayed,
                        "exit": state,
                        "cleanup": cleanup,
                        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                        "sibling_untouched": sibling_id,
                    }
                )
            finally:
                runtime.run(["docker", "rm", "--force", name], capture_output=True, timeout=20)
    finally:
        run(["docker", "rm", "--force", sibling], capture_output=True, timeout=20)
    (output / "acceptance.json").write_text(
        json.dumps(
            {
                "cases": cases,
                "fault_injection": "lost rm reply and two inspection replies after real calls",
                "native_calls_reexecuted": False,
                "scientific_research_acceptance": False,
                "frozen_container_runtime": runtime.value,
                "temporary_profile_removed_before_attach": args.bind_local_daemon,
                "installed_components_unchanged": True,
            },
            indent=2,
        )
    )
    print(json.dumps({"actual_native_cases": len(cases), "scientific_calculations": 0}))


if __name__ == "__main__":
    main()
