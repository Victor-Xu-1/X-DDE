"""A finished native CLI must not be confused with Docker auto-removal completion."""

import json
import subprocess

import pytest

from opendde_workbench import native_container_cleanup
from opendde_workbench.deployment import native_probe, native_probe_ownership
from opendde_workbench.deployment.process import Paused

IMAGE = "sha256:" + "b" * 64
CONTAINER = "c" * 64


class ProbeDocker:
    def __init__(self, monkeypatch, outcome="success"):
        self.outcome, self.value, self.commands = outcome, None, []
        monkeypatch.setattr(native_probe_ownership.subprocess, "run", self.command)
        monkeypatch.setattr(
            native_container_cleanup, "CONFIRM_SECONDS", 0 if outcome == "cleanup_timeout" else 3
        )

    def execute(self, args, **kwargs):
        self.commands.append((args, kwargs))
        if args[1] == "create":
            assert kwargs["timeout"] == 30 and "--rm" not in args
            labels = [args[n + 1] for n, value in enumerate(args) if value == "--label"]
            self.value = {
                "Id": CONTAINER,
                "Name": "/" + args[args.index("--name") + 1],
                "Image": IMAGE,
                "Config": {"Labels": dict(value.split("=", 1) for value in labels)},
                "State": {
                    "Status": "created",
                    "Running": False,
                    "ExitCode": 0,
                    "OOMKilled": False,
                    "Dead": False,
                },
            }
            if self.outcome == "foreign":
                self.value["Config"]["Labels"][native_probe.TOKEN_LABEL] = "different-owner"
            if self.outcome == "create_timeout":
                raise TimeoutError("create client timed out after daemon creation")
            return CONTAINER
        if args[1] == "inspect":
            return json.dumps(self.value)
        assert args == ["docker", "start", "--attach", CONTAINER]
        assert kwargs["timeout"] == 120
        self.value["State"].update(Status="exited", Running=False)
        if self.outcome in {"timeout", "paused", "still_running"}:
            self.value["State"].update(Status="running", Running=True)
            if self.outcome == "timeout":
                raise TimeoutError("native CLI exceeded its budget")
            if self.outcome == "paused":
                raise Paused("installation paused")
        elif self.outcome == "native_failure":
            self.value["State"]["ExitCode"] = 7
            raise RuntimeError("native import failed")
        elif self.outcome == "oom":
            self.value["State"]["OOMKilled"] = True
        elif self.outcome == "invalid_exit":
            self.value["State"]["ExitCode"] = "0"
        return "real native help\n"

    def command(self, args, **kwargs):
        self.commands.append((args, kwargs))
        assert kwargs["timeout"] <= 15
        if args[1] == "inspect":
            if self.value is None:
                return subprocess.CompletedProcess(
                    args, 1, "", "Error: No such object: " + args[-1] + "\n"
                )
            return subprocess.CompletedProcess(args, 0, json.dumps(self.value), "")
        if args[1] == "info":
            return subprocess.CompletedProcess(args, 0, '"test-daemon"', "")
        if args[1] == "kill":
            assert args[-1] == CONTAINER
            self.value["State"].update(Status="exited", Running=False, ExitCode=137)
            return subprocess.CompletedProcess(args, 0, "", "")
        if self.value is None:
            raise subprocess.CalledProcessError(1, args, stderr="No such container")
        assert args == ["docker", "rm", CONTAINER]
        if self.outcome == "cleanup_timeout":
            raise subprocess.TimeoutExpired(args, 15)
        self.value = None
        return subprocess.CompletedProcess(args, 0, "", "")


def probe(tmp_path, docker):
    native_probe.run_probe(
        "reinvent",
        IMAGE,
        ["--network", "none", "--read-only", "--entrypoint", "python", IMAGE, "--help"],
        docker.execute,
        tmp_path,
    )


def test_native_exit_and_removal_are_distinct_required_admission_gates(tmp_path, monkeypatch):
    docker = ProbeDocker(monkeypatch)
    probe(tmp_path, docker)
    record = json.loads((tmp_path / "native-probe.json").read_text())
    assert record["state"] == "succeeded" and record["cleanup_confirmed"]
    assert record["native_exit"]["ExitCode"] == 0
    assert (tmp_path / "native-cli.log").read_text() == "real native help\n"
    assert json.loads((tmp_path / "native-cleanup.json").read_text())["state"] == "removed"
    assert [args[1] for args, _ in docker.commands].count("start") == 1
    assert [args[1] for args, _ in docker.commands].count("rm") == 1
    assert all(args[1] != "run" and "--rm" not in args for args, _ in docker.commands)
    assert not any(args[1] == "kill" for args, _ in docker.commands)


@pytest.mark.parametrize(
    "outcome, exception",
    [
        ("native_failure", RuntimeError),
        ("oom", RuntimeError),
        ("invalid_exit", RuntimeError),
        ("still_running", RuntimeError),
        ("timeout", TimeoutError),
        ("paused", Paused),
        ("create_timeout", TimeoutError),
    ],
)
def test_failure_timeout_and_pause_never_publish_readiness_or_leave_owned_work(
    tmp_path,
    monkeypatch,
    outcome,
    exception,
):
    docker = ProbeDocker(monkeypatch, outcome)
    with pytest.raises(exception):
        probe(tmp_path, docker)
    record = json.loads((tmp_path / "native-probe.json").read_text())
    assert record["state"] == "failed" and record["cleanup_confirmed"]
    assert docker.value is None
    killed = [args for args, _ in docker.commands if args[1] == "kill"]
    assert killed == (
        [["docker", "kill", CONTAINER]] if outcome in {"still_running", "timeout", "paused"} else []
    )
    if outcome == "native_failure":
        assert record["cleanup_observed_state"]["ExitCode"] == 7


def test_successful_help_with_unconfirmed_cleanup_stays_uninstalled(tmp_path, monkeypatch):
    docker = ProbeDocker(monkeypatch, "cleanup_timeout")
    with pytest.raises(RuntimeError, match="removal could not be confirmed"):
        probe(tmp_path, docker)
    record = json.loads((tmp_path / "native-probe.json").read_text())
    assert record["native_exit"]["ExitCode"] == 0
    assert record["state"] == "cleanup_unconfirmed" and not record["cleanup_confirmed"]
    assert sum(args[1] == "start" for args, _ in docker.commands) == 1


def test_completed_probe_reentry_preserves_history_and_reconciles_before_restarting(
    tmp_path,
    monkeypatch,
):
    docker = ProbeDocker(monkeypatch)
    probe(tmp_path, docker)
    original = (tmp_path / "native-probe.json").read_bytes()
    previous = json.loads(original)
    probe(tmp_path, docker)
    history = tmp_path / "native-probe-history" / previous["token"]
    assert (history / "native-probe.json").read_bytes() == original
    assert (history / "native-cli.log").read_text() == "real native help\n"
    recoveries = list(history.glob("recovery-*/reconciliation.json"))
    assert len(recoveries) == 1 and json.loads(recoveries[0].read_text())["state"] == "removed"
    latest = json.loads((tmp_path / "native-probe.json").read_text())
    assert latest["token"] != previous["token"] and latest["cleanup_confirmed"]


def test_interrupted_owned_probe_is_cleaned_before_any_new_native_command(tmp_path, monkeypatch):
    docker = ProbeDocker(monkeypatch)
    probe(tmp_path, docker)
    previous = json.loads((tmp_path / "native-probe.json").read_text())
    previous.update(state="created", cleanup_confirmed=False)
    previous.pop("native_exit")
    (tmp_path / "native-probe.json").write_text(json.dumps(previous))
    docker.value = {
        "Id": CONTAINER,
        "Name": "/" + previous["container"],
        "Image": IMAGE,
        "Config": {
            "Labels": {
                native_probe.TOKEN_LABEL: previous["token"],
                native_probe.PROGRAM_LABEL: "reinvent",
            }
        },
        "State": {
            "Status": "running",
            "Running": True,
            "ExitCode": 0,
            "OOMKilled": False,
            "Dead": False,
        },
    }
    docker.commands.clear()
    probe(tmp_path, docker)
    commands = [args[1] for args, _ in docker.commands]
    assert commands.index("kill") < commands.index("rm") < commands.index("create")
    assert commands.count("start") == 1


def test_invalid_previous_receipt_cannot_clean_or_start_any_container(tmp_path, monkeypatch):
    docker = ProbeDocker(monkeypatch)
    original = '{"schema": 1, "container": "someone-else"}'
    (tmp_path / "native-probe.json").write_text(original)
    with pytest.raises(RuntimeError, match="ownership receipt is invalid"):
        probe(tmp_path, docker)
    assert docker.commands == []
    assert (tmp_path / "native-probe.json").read_text() == original


def test_unverified_container_is_never_started_stopped_or_removed(tmp_path, monkeypatch):
    docker = ProbeDocker(monkeypatch, "foreign")
    with pytest.raises(RuntimeError, match="ownership could not be verified"):
        probe(tmp_path, docker)
    assert not any(args[1] in {"start", "kill", "rm"} for args, _ in docker.commands)
    record = json.loads((tmp_path / "native-probe.json").read_text())
    assert record["state"] == "cleanup_unconfirmed" and not record["cleanup_confirmed"]
