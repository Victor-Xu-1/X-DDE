"""Actual failure boundary: a container can disappear after its client times out."""

import json
import subprocess
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench.container_supervision import attach


@pytest.mark.parametrize("outcome", ["removed", "still_present", "daemon_unavailable"])
def test_native_success_requires_both_exit_evidence_and_confirmed_cleanup(
    tmp_path, monkeypatch, outcome
):
    directory = tmp_path / str(uuid4())
    directory.mkdir()
    container = "xdde-posebusters-" + directory.name
    inspections = 0
    commands = []

    def run(args, **kwargs):
        nonlocal inspections
        commands.append(args)
        if args[1] == "start":
            return SimpleNamespace(returncode=0)
        if args[1] == "rm":
            raise subprocess.TimeoutExpired(args, 15)
        if args[1] == "inspect":
            inspections += 1
            if inspections == 1 or outcome == "still_present":
                return SimpleNamespace(
                    returncode=0,
                    stderr="",
                    stdout=json.dumps(
                        {
                            "Running": False,
                            "ExitCode": 0,
                            "OOMKilled": False,
                        }
                    ),
                )
            return SimpleNamespace(
                returncode=1, stdout="", stderr="Error: No such object: " + container + "\n"
            )
        if args[1] == "info":
            if outcome == "daemon_unavailable":
                raise subprocess.TimeoutExpired(args, 15)
            return SimpleNamespace(returncode=0, stdout='"29.6.1"\n')
        raise AssertionError("Unexpected operation: " + str(args))

    monkeypatch.setattr("opendde_workbench.container_supervision.subprocess.run", run)
    if outcome == "removed":
        attach(directory, "xdde-posebusters-")
    else:
        with pytest.raises(RuntimeError, match="removal could not be confirmed"):
            attach(directory, "xdde-posebusters-")
    assert json.loads((directory / "native-exit.json").read_text())["ExitCode"] == 0
    assert sum(args[1] == "rm" for args in commands) == 1
    assert all(container in args for args in commands if args[1] != "info")
