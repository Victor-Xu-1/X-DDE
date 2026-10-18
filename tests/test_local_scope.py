"""Resource ownership and admission contracts; no model or expensive task is run."""

import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench import local_process, local_scope, scope_control
from opendde_workbench.execution_environment import capture


@pytest.mark.parametrize(
    "values", [{"cpu": 0}, {"memory_mib": 65537}, {"pids": True}, {"runtime_seconds": 0}]
)
def test_invalid_resource_policies_are_not_executable(values):
    with pytest.raises(ValueError):
        local_scope.ScopeLimits(**values)


def test_another_tasks_unit_cannot_be_stopped(tmp_path, monkeypatch):
    directory = tmp_path / str(uuid4())
    directory.mkdir()
    calls = []

    async def forbidden(*args, **kwargs):
        calls.append(args)
        raise AssertionError("Never contact a unit outside the exact task ownership boundary.")

    monkeypatch.setattr(scope_control, "control", forbidden)
    foreign = f"xdde-native-{uuid4()}-{'a' * 16}.scope"
    with pytest.raises(RuntimeError, match="ownership"):
        asyncio.run(scope_control.stop_scope(directory, {"scope_unit": foreign}))
    assert calls == []


def test_unavailable_controller_has_no_unbounded_process_fallback(tmp_path, monkeypatch):
    directory = tmp_path / str(uuid4())
    directory.mkdir()

    def unavailable():
        raise RuntimeError("Resource controller unavailable")

    async def forbidden(*args, **kwargs):
        raise AssertionError("Scientific processes must not start without resource caps.")

    monkeypatch.setattr(local_scope, "controller_environment", unavailable)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    with pytest.raises(RuntimeError, match="unavailable"):
        asyncio.run(
            local_process.start(
                Path(sys.executable),
                directory / "runner.py",
                directory,
                {},
                limits=local_scope.ScopeLimits(),
            )
        )
    assert not (directory / "scope-config.json").exists()


def test_scope_controller_connection_is_separate_from_the_scientific_environment(
    tmp_path, monkeypatch
):
    directory = tmp_path / str(uuid4())
    directory.mkdir()
    controller = {"PATH": "/usr/bin:/bin", "DBUS_SESSION_BUS_ADDRESS": "unix:path=/owned/bus"}
    monkeypatch.setattr(local_scope, "controller_environment", lambda: controller)

    async def help_command(*args, **kwargs):
        return 0, "--expand-environment=BOOL", ""

    monkeypatch.setattr(local_scope, "control", help_command)
    scientific = {"HOME": "/owned", "PATH": "/owned/bin", "LITERAL": "$unchanged"}
    arguments, environment, unit = asyncio.run(
        local_scope.launch(
            Path(sys.executable),
            directory / "runner $literal.py",
            directory,
            scientific,
            local_scope.ScopeLimits(),
        )
    )
    assert environment == controller and "--expand-environment=no" in arguments
    assert "--property=MemoryMax=4294967296" in arguments
    assert "--property=MemorySwapMax=0" in arguments and "--property=OOMPolicy=kill" in arguments
    snapshot = json.loads((directory / "scope-config.json").read_text())
    assert snapshot["environment"] == scientific
    assert "DBUS_SESSION_BUS_ADDRESS" not in snapshot["environment"]
    assert snapshot["unit"] == unit and snapshot["script"].endswith("runner $literal.py")


def test_environment_metadata_records_policy_without_claiming_kernel_verification(settings):
    record = capture(settings, "diffsbdd")
    assert record.verification == "installation_metadata_only"
    runtime = record.specification.runtime
    assert runtime["resource_controller"] == "systemd_user_scope_v1"
    assert json.loads(runtime["resource_policy"])["memory_mib"] == 4096
    assert len(runtime["resource_guard_sha256"]) == 64
