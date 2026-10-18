"""Hard resource admission and exact created-container verification, without science."""

import json
from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench import engine as module
from opendde_workbench.engine import DockerEngine
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Prediction
from opendde_workbench.opendde_limits import OpenDDELimits, require_support

IDENTIFIER = "b" * 64
IMAGE = "example/runtime@sha256:" + "a" * 64
SUPPORT = dict.fromkeys(("memory", "swap", "cpu_quota", "cpu_period", "pids"), True)


@pytest.fixture
def anyio_backend():
    return "asyncio"


def job():
    return SimpleNamespace(
        id=str(uuid4()),
        request=Prediction(
            name="resource admission",
            components=[{"kind": "protein", "value": "ACDE"}],
            parameters={"device": "cpu"},
        ),
    )


def metadata(value, limits=None):
    limits = limits or OpenDDELimits()
    return {
        "id": IDENTIFIER,
        "name": "/" + DockerEngine.container(value.id),
        "image": IMAGE,
        "job": value.id,
        "memory": limits.memory_mib * 1024**2,
        "memory_swap": limits.memory_mib * 1024**2,
        "nano_cpus": limits.cpus * 10**9,
        "pids_limit": limits.pids,
        "oom_kill_disable": False,
    }


@pytest.mark.parametrize(
    "change",
    [
        {"cpus": 0},
        {"cpus": True},
        {"cpus": 257},
        {"memory_mib": 0},
        {"memory_mib": 255},
        {"memory_mib": -1},
        {"pids": 0},
        {"pids": 4097},
    ],
)
def test_no_unbounded_or_coerced_resource_policy(change):
    with pytest.raises(ValidationError):
        OpenDDELimits(**change)


def test_defaults_configured_threads_and_immutable_environment(settings, tmp_path):
    value = job()
    configured = replace(settings, opendde_cpus=3, opendde_memory_mib=8192, opendde_pids=512)
    args = DockerEngine(configured).arguments(value, tmp_path, (IMAGE, tmp_path))
    for flag, expected in {
        "--memory": str(8192 * 1024**2),
        "--memory-swap": str(8192 * 1024**2),
        "--cpus": "3",
        "--pids-limit": "512",
    }.items():
        assert args[args.index(flag) + 1] == expected
    assert "OMP_NUM_THREADS=3" in args and "MKL_NUM_THREADS=3" in args
    assert "org.xdde.job=" + value.id in args
    assert "--oom-kill-disable" not in args and "--privileged" not in args
    original = capture(settings, "opendde")
    changed = capture(configured, "opendde")
    assert original.snapshot_sha256 != changed.snapshot_sha256
    assert original.specification.runtime["memory_limit_mib"] == "4096"
    assert changed.specification.runtime["swap_limit_mib"] == "0"


@pytest.mark.anyio
@pytest.mark.parametrize("change", [{key: False} for key in SUPPORT] + [{"memory": 1}])
async def test_missing_or_invalid_controller_prevents_admission(change):
    async def command(*args, **kwargs):
        return 0, json.dumps({**SUPPORT, **change})

    with pytest.raises(RuntimeError, match="cannot enforce"):
        await require_support(command)


@pytest.mark.parametrize(
    "change",
    [
        {"memory": 0},
        {"memory_swap": -1},
        {"memory_swap": 0},
        {"nano_cpus": 0},
        {"pids_limit": 0},
        {"pids_limit": None},
        {"oom_kill_disable": True},
        {"oom_kill_disable": 0},
        {"job": "other"},
        {"id": "c" * 64},
        {"image": "mutable:latest"},
        {"name": "/other"},
    ],
)
def test_created_container_cannot_ignore_limits_or_change_identity(change):
    value = job()
    with pytest.raises(RuntimeError, match="not started"):
        OpenDDELimits().verify(
            {**metadata(value), **change},
            container_id=IDENTIFIER,
            name=DockerEngine.container(value.id),
            image=IMAGE,
            job_id=value.id,
        )


@pytest.mark.anyio
@pytest.mark.parametrize("valid", [False, True])
async def test_start_verifies_created_identity_and_caps_before_native_launch(
    settings, tmp_path, monkeypatch, valid
):
    value = job()
    directory = tmp_path / value.id
    (directory / "output").mkdir(parents=True)
    code = tmp_path / "runtime"
    for name in ("runner/batch_inference.py", "opendde/data/inference/json_to_feature.py"):
        target = code / "external/opendde" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("# controlled source fixture\n")
    backend = DockerEngine(settings)
    monkeypatch.setattr(backend, "runtime", lambda: (IMAGE, code))
    calls = []

    async def command(*args, **kwargs):
        calls.append(args)
        if args[:2] == ("docker", "info"):
            return 0, json.dumps(SUPPORT)
        if args[:2] == ("docker", "create"):
            return 0, IDENTIFIER
        if args[:3] == ("docker", "container", "inspect"):
            return 0, json.dumps({**metadata(value), **({} if valid else {"memory": 0})})
        raise AssertionError(args)

    launched = []

    async def launch(*args, **kwargs):
        launched.append(args)
        return "controlled-process-handle"

    monkeypatch.setattr(module, "command", command)
    monkeypatch.setattr(module.asyncio, "create_subprocess_exec", launch)
    if not valid:
        with pytest.raises(RuntimeError, match="not applied"):
            await backend.start(value, directory)
        assert not launched and not (directory / "resource-limits.json").exists()
    else:
        assert await backend.start(value, directory) == "controlled-process-handle"
        assert launched == [("docker", "start", "--attach", IDENTIFIER)]
        receipt = json.loads((directory / "resource-limits.json").read_text())
        assert receipt["container_id"] == IDENTIFIER
        assert receipt["verified_before_start"]["memory_swap"] == 4096 * 1024**2
    assert [call[1] for call in calls] == ["info", "create", "container"]


def test_operator_configuration_uses_existing_settings_authority(tmp_path, monkeypatch):
    from opendde_workbench.settings import Settings

    monkeypatch.setenv("WB_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("WB_OPENDDE_CPUS", "4")
    monkeypatch.setenv("WB_OPENDDE_MEMORY_MIB", "16384")
    monkeypatch.setenv("WB_OPENDDE_PIDS", "768")
    assert OpenDDELimits.configured(Settings.from_env()) == OpenDDELimits(
        cpus=4, memory_mib=16384, pids=768
    )


@pytest.mark.anyio
async def test_unsupported_host_never_creates_or_starts_a_container(
    settings, tmp_path, monkeypatch
):
    calls = []

    async def command(*args, **kwargs):
        calls.append(args)
        assert args[:2] == ("docker", "info")
        return 0, json.dumps({**SUPPORT, "swap": False})

    monkeypatch.setattr(module, "command", command)
    with pytest.raises(RuntimeError, match="cannot enforce"):
        await DockerEngine(settings).start(job(), tmp_path)
    assert len(calls) == 1


@pytest.mark.anyio
async def test_unavailable_controller_changes_engine_readiness_only(
    settings, tmp_path, monkeypatch
):
    backend = DockerEngine(settings)
    monkeypatch.setattr(backend, "runtime", lambda: (IMAGE, tmp_path))

    async def command(*args, **kwargs):
        if args[:3] == ("docker", "image", "inspect"):
            return 0, "controlled image metadata"
        assert args[:2] == ("docker", "info")
        return 0, json.dumps({**SUPPORT, "memory": False})

    monkeypatch.setattr(module, "command", command)
    state = await backend.readiness()
    assert state["ready"] is False
    assert "cannot enforce" in state["reason"]
