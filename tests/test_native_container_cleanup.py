"""Actual failure boundary: a container can disappear after its client times out."""

import json
import subprocess
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench import native_container_cleanup as cleanup
from opendde_workbench.container_supervision import attach


@pytest.mark.parametrize(
    "outcome", ["removed", "removed_late", "still_present", "daemon_unavailable", "running"]
)
def test_native_success_requires_both_exit_evidence_and_confirmed_cleanup(
    tmp_path, monkeypatch, outcome
):
    directory = tmp_path / str(uuid4())
    directory.mkdir()
    container = "xdde-posebusters-" + directory.name
    inspections = 0
    commands = []
    clock = [0.0]
    monkeypatch.setattr(cleanup.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(
        cleanup.time, "sleep", lambda duration: clock.__setitem__(0, clock[0] + duration)
    )

    def run(args, **kwargs):
        nonlocal inspections
        commands.append(args)
        clock[0] += 1
        if args[1] == "start":
            return SimpleNamespace(returncode=0)
        if args[1] == "rm":
            raise subprocess.TimeoutExpired(args, 15)
        if args[1] == "inspect":
            inspections += 1
            if outcome == "removed_late" and inspections in {2, 3}:
                raise subprocess.TimeoutExpired(args, 5)
            if (
                inspections == 1
                or outcome in {"still_present", "running"}
                or (outcome == "removed_late" and inspections == 4)
            ):
                return SimpleNamespace(
                    returncode=0,
                    stderr="",
                    stdout=json.dumps(
                        {
                            "Running": outcome == "running" and inspections > 1,
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
    if outcome in {"removed", "removed_late"}:
        attach(directory, "xdde-posebusters-")
    else:
        with pytest.raises(RuntimeError, match="removal could not be confirmed"):
            attach(directory, "xdde-posebusters-")
    assert json.loads((directory / "native-exit.json").read_text())["ExitCode"] == 0
    assert sum(args[1] == "rm" for args in commands) == 1
    assert all(container in args for args in commands if args[1] != "info")
    assert sum(args[1] == "start" for args in commands) == 1
    assert all("--force" not in args for args in commands)
    record = json.loads((directory / "native-cleanup.json").read_text())
    assert record["state"] == (
        "removed" if outcome in {"removed", "removed_late"} else "unconfirmed"
    )
    assert len(record["observations"]) <= cleanup.CONFIRM_SECONDS
    if outcome == "removed_late":
        assert len(record["observations"]) >= 4


@pytest.mark.parametrize("exit_code,oom", [(2, False), (0, True)])
def test_cleanup_success_cannot_override_native_scientific_failure(
    tmp_path, monkeypatch, exit_code, oom
):
    directory = tmp_path / str(uuid4())
    directory.mkdir()

    def run(args, **kwargs):
        if args[1] == "inspect":
            return SimpleNamespace(
                stdout=json.dumps({"Running": False, "ExitCode": exit_code, "OOMKilled": oom})
            )
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(cleanup.subprocess, "run", run)
    with pytest.raises(RuntimeError, match="did not finish successfully"):
        attach(directory, "xdde-reinvent-")
    assert json.loads((directory / "native-cleanup.json").read_text())["state"] == "removed"
