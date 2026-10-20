"""Real Docker exit/artifact evidence with controlled lost cleanup observations in CI."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from opendde_workbench.container_supervision import attach
from opendde_workbench.receptors.image import PYTHON_IMAGE


def lost_cleanup_observations(run, delayed, commands):
    removed, lost_reads = False, 0

    def controlled(arguments, **kwargs):
        nonlocal removed, lost_reads
        commands.append(arguments)
        value = run(arguments, **kwargs)
        # Execute real calls before injecting lost replies; positive absence,
        # program output and exit status are always read from the real daemon.
        if delayed and arguments[1] == "rm":
            removed = True
            raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
        if delayed and removed and arguments[1] == "inspect" and lost_reads < 2:
            lost_reads += 1
            raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])
        return value

    return controlled


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    assert output.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    output.mkdir(parents=True, exist_ok=False)
    run = subprocess.run
    run(["docker", "pull", PYTHON_IMAGE], check=True, timeout=180)
    sibling = "xdde-reinvent-" + str(uuid4())
    run(
        ["docker", "create", "--name", sibling, PYTHON_IMAGE, "python", "-c", "pass"],
        check=True,
        capture_output=True,
        timeout=20,
    )
    cases = []
    try:
        for delayed, code in ((False, 0), (True, 0), (True, 7)):
            directory = output / str(uuid4())
            directory.mkdir()
            name = "xdde-reinvent-" + directory.name
            artifact = directory / "native-output.txt"
            run(
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
                assert state["ExitCode"] == code and not state["Running"] and not state["OOMKilled"]
                assert cleanup["state"] == "removed"
                assert artifact.read_text() == "original native artifact"
                assert sum(command[1] == "start" for command in commands) == 1
                assert sum(command[1] == "rm" for command in commands) == 1
                assert all(name in command for command in commands if command[1] != "info")
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
                run(["docker", "rm", "--force", name], capture_output=True, timeout=20)
    finally:
        run(["docker", "rm", "--force", sibling], capture_output=True, timeout=20)
    (output / "acceptance.json").write_text(
        json.dumps(
            {
                "cases": cases,
                "fault_injection": "lost rm reply and two inspection replies after real calls",
                "native_calls_reexecuted": False,
                "scientific_research_acceptance": False,
            },
            indent=2,
        )
    )
    print(json.dumps({"actual_native_cases": len(cases), "scientific_calculations": 0}))


if __name__ == "__main__":
    main()
