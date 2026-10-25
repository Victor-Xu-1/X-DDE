"""Owned GPU setup lifecycle with controlled responses, without GPU/model execution."""

import json
import subprocess
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest

from opendde_workbench.deployment import native_compute_probe as probe
from opendde_workbench.opendde_limits import OpenDDELimits

LOADER = "/usr/lib/wsl/drivers/reviewed_driver/libcuda_loader.so"
IDENTIFIER = "a" * 64


@pytest.fixture
def boundary(monkeypatch, tmp_path):
    state = SimpleNamespace(mode="success", calls=[], removed=False, current=None)
    connection = {"state_id": "owned-state", "image": "reviewed-image@sha256:" + "b" * 64}

    def run(arguments, **kwargs):
        state.calls.append(arguments)
        assert kwargs["timeout"] <= 20
        if arguments[:2] == ["docker", "run"]:
            assert "--rm" not in arguments
            assert arguments[arguments.index("--gpus") + 1] == "all"
            assert arguments[arguments.index("--network") + 1] == "none"
            assert "ctypes.CDLL('libcuda.so.1')" in arguments[-1]
            labels = dict(
                arguments[i + 1].split("=", 1)
                for i, arg in enumerate(arguments)
                if arg == "--label"
            )
            state.current = {
                "Id": IDENTIFIER,
                "Config": {"Image": connection["image"], "Labels": labels},
                "State": {"Status": "exited", "Running": False, "Pid": 0, "ExitCode": 0},
            }
            if state.mode != "no_cid":
                Path(arguments[arguments.index("--cidfile") + 1]).write_text(IDENTIFIER)
            if state.mode == "timeout":
                state.current["State"].update(Status="running", Running=True, Pid=123)
                raise subprocess.TimeoutExpired(arguments, 20)
            return subprocess.CompletedProcess(
                arguments,
                0,
                json.dumps([LOADER if state.mode != "bad_loader" else "/tmp/untrusted.so"]),
                "",
            )
        if arguments[1:3] == ["container", "inspect"]:
            assert arguments[-1] == IDENTIFIER
            if state.removed:
                return subprocess.CompletedProcess(
                    arguments, 1, "[]", "No such container: " + IDENTIFIER
                )
            current = deepcopy(state.current)
            if state.mode == "foreign":
                current["Config"]["Labels"]["org.xdde.owner"] = "another-application"
            return subprocess.CompletedProcess(arguments, 0, json.dumps([current]), "")
        if arguments[1] == "stop":
            assert arguments[-1] == IDENTIFIER and arguments[2:4] == ["--time", "2"]
            state.current["State"].update(Status="exited", Running=False, Pid=0, ExitCode=143)
            return subprocess.CompletedProcess(arguments, 0, IDENTIFIER, "")
        assert arguments[1] == "rm" and arguments[-1] == IDENTIFIER
        if state.mode == "pending":
            state.current["State"]["Status"] = "removing"
            raise subprocess.TimeoutExpired(arguments, 3)
        if state.mode == "denied":
            raise subprocess.CalledProcessError(1, arguments)
        state.removed = True
        return subprocess.CompletedProcess(arguments, 0, IDENTIFIER, "")

    monkeypatch.setattr(probe.subprocess, "run", run)
    return state, connection, tmp_path


@pytest.mark.parametrize("mode", ["success", "pending"])
def test_completed_probe_does_not_wait_for_dead_container_unlinking(boundary, mode):
    state, connection, shared = boundary
    state.mode = mode
    assert probe.load_cuda(connection, OpenDDELimits(), shared) == LOADER
    receipt = json.loads(next((shared / "native-probes").glob("*.json")).read_text())
    assert receipt["container_id"] == IDENTIFIER
    assert receipt["phase"] == ("removed" if mode == "success" else "cleanup_pending")
    assert receipt["resource_limits"] == OpenDDELimits().model_dump()
    assert len([args for args in state.calls if args[1] == "rm"]) == 1
    assert not [args for args in state.calls if args[1] == "stop"]


@pytest.mark.parametrize("mode", ["foreign", "denied", "no_cid", "bad_loader"])
def test_unknown_ownership_cleanup_or_loader_never_qualifies_setup(boundary, mode):
    state, connection, shared = boundary
    state.mode = mode
    with pytest.raises(ValueError):
        probe.load_cuda(connection, OpenDDELimits(), shared)
    if mode in {"foreign", "no_cid"}:
        assert all(args[1] not in {"rm", "stop"} for args in state.calls)


def test_timed_out_probe_stops_only_its_exact_owned_id_and_preserves_intent(boundary):
    state, connection, shared = boundary
    state.mode = "timeout"
    with pytest.raises(subprocess.TimeoutExpired):
        probe.load_cuda(connection, OpenDDELimits(), shared)
    assert state.removed
    assert [args[-1] for args in state.calls if args[1] == "stop"] == [IDENTIFIER]
    receipt = json.loads(next((shared / "native-probes").glob("*.json")).read_text())
    assert receipt["phase"] == "removed" and receipt["returncode"] is None
