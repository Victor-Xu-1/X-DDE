"""Runtime changes cannot redirect an existing task or falsely clean an old probe."""

import json
import subprocess
from types import SimpleNamespace

import pytest

from opendde_workbench import container_runtime as runtime
from opendde_workbench.container_supervision import attach
from opendde_workbench.deployment.network import build_command
from opendde_workbench.locations import atomic_json

ENDPOINT = "unix:///srv/wsl/tmp/xdde/docker.sock"
DAEMON = "318e9cd2-c1e9-4ec0-8635-c2d2e12eba39"
BOUND = runtime.DockerRuntime(ENDPOINT, DAEMON)


@pytest.mark.parametrize(
    "endpoint,daemon",
    [
        ("tcp://127.0.0.1:2375", DAEMON),
        ("unix:///tmp/../docker.sock", DAEMON),
        ("unix:///tmp//docker.sock", DAEMON),
        (ENDPOINT, None),
        (None, DAEMON),
        ("unix:///tmp/docker.sock;other", DAEMON),
        (ENDPOINT, ""),
    ],
)
def test_only_explicit_local_socket_and_daemon_identity_are_accepted(endpoint, daemon):
    with pytest.raises(ValueError):
        runtime.DockerRuntime(endpoint, daemon)


def test_existing_installed_environments_and_legacy_probes_remain_on_original_daemon(tmp_path):
    state, root, operation = tmp_path / "state", tmp_path / "root", tmp_path / "operation"
    atomic_json(state / "deployment.json", {"root": str(root)})
    atomic_json(root / "installed.json", {"deepternary": {"image": "old-image"}})
    atomic_json(
        root / "container-runtimes.json", {"schema": 1, "engines": {"deepternary": BOUND.value}}
    )
    assert runtime.installed(SimpleNamespace(state_dir=state), "deepternary").value is None
    atomic_json(operation / "native-probe.json", {"container": "old-owned-container"})
    assert runtime.installation(root, "deepternary", operation).value is None
    assert runtime.read(operation).value is None
    fresh = runtime.installation(root, "deepternary", tmp_path / "fresh")
    assert fresh == BOUND


def test_task_cancel_and_installer_retry_use_frozen_binding_after_configuration_changes(tmp_path):
    state, root, job, operation = [
        tmp_path / name for name in ("state", "root", "job", "operation")
    ]
    atomic_json(state / "deployment.json", {"root": str(root)})
    atomic_json(root / "installed.json", {"deepternary": {"container_runtime": BOUND.value}})
    atomic_json(
        root / "container-runtimes.json", {"schema": 1, "engines": {"deepternary": BOUND.value}}
    )
    settings = SimpleNamespace(state_dir=state)
    assert runtime.task(settings, "deepternary", job) == BOUND
    assert runtime.installation(root, "deepternary", operation) == BOUND
    atomic_json(root / "installed.json", {})
    atomic_json(root / "container-runtimes.json", {"schema": 1, "engines": {}})
    assert runtime.read(job) == BOUND
    assert runtime.task(settings, "deepternary", job) == BOUND
    assert runtime.installation(root, "deepternary", operation) == BOUND
    assert runtime.task(settings, "deepternary", tmp_path / "new-job").value is None


@pytest.mark.parametrize("action", ["start", "inspect", "rm", "kill"])
def test_wrong_daemon_cannot_start_observe_or_remove_any_container(monkeypatch, action):
    calls = []

    def execute(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, json.dumps("a-different-daemon"), "")

    monkeypatch.setattr(runtime.subprocess, "run", execute)
    with pytest.raises(RuntimeError, match="daemon identity"):
        BOUND.run(["docker", action, "owned-container"], timeout=15)
    assert calls == [["docker", "--host", ENDPOINT, "info", "--format", "{{json .ID}}"]]


@pytest.mark.asyncio
async def test_parent_async_creation_always_uses_verified_explicit_host():
    calls = []

    async def execute(*args, **kwargs):
        calls.append(args)
        return (0, json.dumps(DAEMON)) if args[3] == "info" else (0, "container")

    assert await BOUND.command(execute, "docker", "create", "image") == (0, "container")
    assert calls[-1] == ("docker", "--host", ENDPOINT, "create", "image")


def test_child_attach_and_cleanup_share_frozen_daemon_without_parent_environment(
    tmp_path, monkeypatch
):
    from uuid import uuid4

    directory = tmp_path / str(uuid4())
    runtime.freeze(directory, BOUND)
    calls = []

    def execute(args, **kwargs):
        calls.append(args)
        assert args[:3] == ["docker", "--host", ENDPOINT]
        command = args[3]
        if command == "info":
            return subprocess.CompletedProcess(args, 0, json.dumps(DAEMON), "")
        if command == "inspect":
            return subprocess.CompletedProcess(
                args, 0, json.dumps({"Running": False, "ExitCode": 0, "OOMKilled": False}), ""
            )
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(runtime.subprocess, "run", execute)
    attach(directory, "xdde-deepternary-")
    assert [call[3] for call in calls if call[3] != "info"] == ["start", "inspect", "rm"]
    proof = json.loads((directory / "native-cleanup.json").read_text())
    assert proof["state"] == "removed" and proof["container_runtime"] == BOUND.value


def test_install_network_still_applies_after_explicit_docker_host():
    args = BOUND.arguments(["docker", "build", "/context"])
    assert build_command(args, {"WB_INSTALL_BUILD_NETWORK": "host"}) == [
        "docker",
        "--host",
        ENDPOINT,
        "build",
        "--network",
        "host",
        "/context",
    ]


def test_symlink_and_malformed_receipts_never_fall_back_to_default_daemon(tmp_path):
    atomic_json(tmp_path / runtime.RECEIPT, {"schema": 2, "runtime": BOUND.value})
    with pytest.raises(ValueError, match="receipt is invalid"):
        runtime.read(tmp_path)
    (tmp_path / runtime.RECEIPT).unlink()
    source = tmp_path / "source"
    atomic_json(source, {"schema": 1, "runtime": BOUND.value})
    (tmp_path / runtime.RECEIPT).symlink_to(source)
    with pytest.raises(ValueError, match="unsafe"):
        runtime.read(tmp_path)


@pytest.mark.asyncio
@pytest.mark.parametrize("backend_name", ["preparation", "docking"])
async def test_actual_cancellation_uses_job_receipt_after_environment_switch(
    tmp_path, monkeypatch, backend_name
):
    from uuid import uuid4

    from opendde_workbench import prepared_container
    from opendde_workbench.docking import backend as docking_backend

    directory = tmp_path / str(uuid4())
    runtime.freeze(directory, BOUND)
    calls = []

    async def execute(*args, **kwargs):
        calls.append(args)
        return (0, json.dumps(DAEMON)) if args[3] == "info" else (0, "")

    async def stop(*args):
        calls.append(("local_process.stop",))

    module = prepared_container if backend_name == "preparation" else docking_backend
    monkeypatch.setattr(module, "command", execute)
    monkeypatch.setattr(module.local_process, "stop", stop)
    settings = SimpleNamespace(state_dir=tmp_path / "new-state")
    if backend_name == "preparation":
        backend = prepared_container.PreparedContainerBackend(
            settings, "deepternary", tmp_path, ["runner.py"], None, None
        )
    else:
        backend = docking_backend.DockingBackend(settings)
    await backend.stop(directory.name, directory)
    assert calls[-2] == (
        "docker",
        "--host",
        ENDPOINT,
        "rm",
        "--force",
        backend.container(directory.name),
    )
    assert calls[-1] == ("local_process.stop",)


def test_installer_build_and_installed_metadata_share_one_bound_daemon(tmp_path, monkeypatch):
    from uuid import uuid4

    from opendde_workbench.deployment import installers, scientific_install

    atomic_json(
        tmp_path / "container-runtimes.json", {"schema": 1, "engines": {"deepternary": BOUND.value}}
    )
    calls = []

    def verify(args, **kwargs):
        assert args == ["docker", "--host", ENDPOINT, "info", "--format", "{{json .ID}}"]
        return subprocess.CompletedProcess(args, 0, json.dumps(DAEMON), "")

    def execute(args, *unused, **kwargs):
        calls.append(args)
        return "native image"

    def install(identifier, root, work, command, report, checkpoint):
        command(["docker", "image", "inspect", "sha256:" + "a" * 64])
        assert runtime.read(work) == BOUND
        return {"image": "sha256:" + "a" * 64}

    monkeypatch.setattr(runtime.subprocess, "run", verify)
    monkeypatch.setattr(installers, "run", execute)
    monkeypatch.setattr(scientific_install, "install_runtime", install)
    metadata = installers.install(
        "deepternary", tmp_path, {}, str(uuid4()), lambda text: None, lambda: None
    )
    assert metadata["container_runtime"] == BOUND.value
    assert calls == [["docker", "--host", ENDPOINT, "image", "inspect", "sha256:" + "a" * 64]]


def test_bound_probe_cannot_be_recovered_using_another_daemon(tmp_path, monkeypatch):
    from uuid import uuid4

    from opendde_workbench.deployment import native_probe_recovery

    token = uuid4().hex
    atomic_json(
        tmp_path / "native-probe.json",
        {
            "schema": 1,
            "program": "reinvent",
            "token": token,
            "container": "xdde-install-reinvent-" + token,
            "image": "sha256:" + "a" * 64,
            "container_runtime": BOUND.value,
        },
    )

    def unexpected(*args, **kwargs):
        raise AssertionError("No container command may run after a binding mismatch")

    monkeypatch.setattr(native_probe_recovery, "cleanup_probe", unexpected)
    with pytest.raises(RuntimeError, match="binding differs"):
        native_probe_recovery.recover_probe(tmp_path, "reinvent")
