"""Owned service resource repair and admission, without Docker or scientific models."""

import json
import sys
from copy import deepcopy
from types import ModuleType, SimpleNamespace

import pytest

from opendde_workbench.deployment import native_compute_limits as resources
from opendde_workbench.deployment import native_compute_service as native
from opendde_workbench.opendde_limits import OpenDDELimits

IDENTIFIER = "a" * 64
IMAGE = "aurekaresearch/opendde-harness@sha256:" + "b" * 64
SUPPORT = dict.fromkeys(("memory", "swap", "cpu_quota", "cpu_period", "pids"), True)
LIMITS = OpenDDELimits(cpus=1, memory_mib=256, pids=64)


@pytest.fixture
def native_boundary(monkeypatch, tmp_path):
    package, cli, factory = (
        ModuleType(name)
        for name in (
            "opendde_harness",
            "opendde_harness.cli",
            "opendde_harness.cli.onboard_compute",
        )
    )
    package.__path__, cli.__path__ = [], []
    package.cli, cli.onboard_compute = cli, factory
    connection = {
        "container": "xdde-harness-resource-test",
        "container_id": IDENTIFIER,
        "state_id": "state-fixture",
        "image": IMAGE,
        "url": "http://127.0.0.1:8080",
        "token": "private-fixture-token",
        "network": "bridge",
        "msa_url": "https://api.colabfold.com",
        "shared_dir": str(tmp_path / "shared"),
        "code": str(tmp_path / "code"),
    }
    current = {
        "Id": IDENTIFIER,
        "Config": {"Image": IMAGE, "Labels": {"org.xdde.owner": "X-DDE"}},
        "State": {"Running": True},
        "HostConfig": {"Memory": 0, "MemorySwap": 0, "NanoCpus": 0, "PidsLimit": None},
    }
    health = {
        "workers": {
            "queue": {"running": 0, "queued": 0},
            "backend": dict.fromkeys(
                ("code_ready", "root_ready", "common_ready", "checkpoint_ready"), True
            ),
        }
    }
    calls = []
    mutate = [True]

    def inspect(identifier):
        calls.append(("inspect", identifier))
        return deepcopy(current)

    def run(*arguments):
        calls.append(arguments)
        if arguments[0] == "info":
            return json.dumps(SUPPORT)
        assert arguments[:2] == ("container", "update")
        assert arguments[-1] == IDENTIFIER
        if mutate[0]:
            current["HostConfig"].update(
                Memory=256 * 1024**2,
                MemorySwap=256 * 1024**2,
                NanoCpus=10**9,
                PidsLimit=64,
            )
        return ""

    def forbidden(*args, **kwargs):
        raise AssertionError("Resource repair must not stop or relaunch this running service.")

    factory.inspect_container, factory.docker, factory.wait_for_service = (
        inspect,
        forbidden,
        forbidden,
    )
    factory.DockerSettings = SimpleNamespace
    factory.create_arguments = lambda *args, **kwargs: (
        ["run", "--detach", "--entrypoint", "python", IMAGE],
        {},
    )
    for module in (package, cli, factory):
        monkeypatch.setitem(sys.modules, module.__name__, module)
    monkeypatch.setattr(native, "health", lambda connection: deepcopy(health))
    monkeypatch.setattr(resources, "run", run)
    return SimpleNamespace(
        connection=connection,
        current=current,
        health=health,
        calls=calls,
        mutate=mutate,
        message={
            "action": "start",
            "connection": connection,
            "root": str(tmp_path),
            "checkpoint": "opendde_abag.pt",
            "resource_limits": LIMITS.model_dump(),
        },
    )


def test_native_factory_bounds_before_entrypoint(native_boundary, tmp_path):
    arguments, _ = native.launch_arguments(native_boundary.connection, tmp_path, "opendde_abag.pt")
    defaults = OpenDDELimits()
    flags = defaults.arguments()
    for index in range(0, len(flags), 2):
        flag, value = flags[index : index + 2]
        assert flag in arguments, "Native service resource flags are missing before launch."
        assert arguments[arguments.index(flag) + 1] == value
        assert arguments.index(flag) < arguments.index("--entrypoint")


def test_idle_legacy_service_is_bounded_without_restart(native_boundary):
    result = native.execute(native_boundary.message)
    assert result["ready"] and result["resource_limits_verified"]
    assert result["resource_limits"] == LIMITS.model_dump()
    assert result["container_id"] == IDENTIFIER
    updates = [call for call in native_boundary.calls if call[:2] == ("container", "update")]
    assert len(updates) == 1 and updates[0][-1] == IDENTIFIER
    assert native_boundary.current["State"]["Running"]


@pytest.mark.parametrize("queue", [None, {"running": 1, "queued": 0}, {"running": 0, "queued": 1}])
def test_busy_or_unknown_service_is_never_reconfigured(native_boundary, queue):
    native_boundary.health["workers"]["queue"] = queue
    with pytest.raises(ValueError, match="Finish"):
        native.execute(native_boundary.message)
    assert not [call for call in native_boundary.calls if call[0] in {"info", "container"}]
    assert native_boundary.current["HostConfig"]["Memory"] == 0


def test_status_is_read_only_and_does_not_call_an_unbounded_service_ready(native_boundary):
    result = native.execute({**native_boundary.message, "action": "status"})
    assert result["running"] and not result["ready"]
    assert result["resource_limits_verified"] is False
    assert all(call[0] == "inspect" for call in native_boundary.calls)


def test_owned_removal_status_never_reports_ready_or_dispatches_cleanup(native_boundary):
    native_boundary.current["State"].update(Status="removing", Running=False, Pid=0)
    result = native.execute({**native_boundary.message, "action": "status"})
    assert result["cleanup_pending"] and not result["ready"] and not result["running"]
    assert all(call[0] == "inspect" for call in native_boundary.calls)


@pytest.mark.parametrize("action", ["start", "stop", "retire"])
def test_removing_owned_service_cannot_receive_repeated_mutations(native_boundary, action):
    native_boundary.current["State"].update(Status="removing", Running=False, Pid=0)
    with pytest.raises(ValueError, match="still cleaning up"):
        native.execute({**native_boundary.message, "action": action})
    assert all(call[0] == "inspect" for call in native_boundary.calls)


def test_zero_exit_without_applied_limits_still_fails(native_boundary):
    native_boundary.mutate[0] = False
    with pytest.raises(RuntimeError, match="not applied"):
        native.execute(native_boundary.message)


@pytest.mark.parametrize("change", [{"Id": "c" * 64}, {"Config": {"Image": IMAGE, "Labels": {}}}])
def test_foreign_or_replaced_instance_is_never_updated(native_boundary, change):
    native_boundary.current.update(change)
    with pytest.raises(ValueError, match="owned"):
        native.execute(native_boundary.message)
    assert all(call[0] == "inspect" for call in native_boundary.calls)


@pytest.mark.parametrize(
    "flag",
    [
        "--memory",
        "--memory=4g",
        "--cpus",
        "--pids-limit",
        "--privileged=true",
        "--oom-kill-disable=true",
    ],
)
def test_competing_factory_limits_and_disabled_protection_fail_closed(flag):
    with pytest.raises(ValueError):
        resources.launch_flags(["run", flag], resources.policy())


@pytest.mark.parametrize("field", ["cpus", "memory_mib", "pids"])
def test_native_boundary_uses_the_same_strict_canonical_policy(field):
    for value in (False, 0, "4096"):
        with pytest.raises(ValueError):
            resources.policy({field: value})


def test_api_forwards_operator_resource_configuration(client_factory, monkeypatch):
    from opendde_workbench.deployment.compute_service import ComputeService

    observed = []

    def snapshot(service):
        observed.append(service.resource_limits.model_dump())
        return {"configured": False, "running": False, "ready": False}

    monkeypatch.setattr(ComputeService, "snapshot", snapshot)
    with client_factory(opendde_cpus=3, opendde_memory_mib=8192, opendde_pids=512) as client:
        assert client.get("/api/deployment").status_code == 200
    assert observed and all(row == {"cpus": 3, "memory_mib": 8192, "pids": 512} for row in observed)
