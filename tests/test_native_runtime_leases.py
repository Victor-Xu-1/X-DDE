"""Temporary scientific execution cannot become a permanent component migration."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench import container_runtime as runtime
from opendde_workbench import native_runtime_leases as leases
from opendde_workbench.locations import atomic_json

SOURCE = "sha256:" + "a" * 64
IMPORTED = "sha256:" + "b" * 64
BOUND = runtime.DockerRuntime("unix:///srv/wsl/tmp/xdde/docker.sock", "daemon-0123456789")


def setup(tmp_path):
    state, root = tmp_path / "state", tmp_path / "components"
    entry = {"image": SOURCE, "version": "reviewed-native-release"}
    atomic_json(state / "deployment.json", {"root": str(root)})
    atomic_json(root / "installed.json", {"gnina": entry, "deepternary": entry})
    now = datetime.now(UTC)
    profile = {
        "schema": 1,
        "owner": "X-DDE",
        "id": str(uuid4()),
        "created_at": (now - timedelta(minutes=1)).isoformat(),
        "expires_at": (now + timedelta(hours=1)).isoformat(),
        "engines": {
            "gnina": {
                "image": IMPORTED,
                "source_image": SOURCE,
                "source_entry_sha256": leases.entry_digest(entry),
                "container_runtime": BOUND.value,
            }
        },
    }
    atomic_json(state / leases.FILE, profile)
    return SimpleNamespace(state_dir=state), root, profile


def test_temporary_execution_freezes_actual_image_and_preserves_installed_components(tmp_path):
    settings, root, profile = setup(tmp_path)
    original = (root / "installed.json").read_bytes()
    selected, binding = runtime.prepare(settings, "gnina", tmp_path / "task", SOURCE)
    assert selected == IMPORTED and binding == BOUND
    frozen = json.loads((tmp_path / "task" / runtime.RECEIPT).read_text())
    assert frozen == {
        "schema": 2,
        "runtime": BOUND.value,
        "image": IMPORTED,
        "source_image": SOURCE,
        "lease_id": profile["id"],
        "lease_expires_at": profile["expires_at"],
    }
    assert (root / "installed.json").read_bytes() == original
    assert not (root / "container-runtimes.json").exists()
    other, binding = runtime.prepare(settings, "deepternary", tmp_path / "other-task", SOURCE)
    assert other == SOURCE and binding.value is None
    assert runtime.installation(root, "gnina", tmp_path / "installation").value is None


def test_expiry_refuses_new_work_but_does_not_redirect_existing_task_or_cancel(tmp_path):
    settings, root, profile = setup(tmp_path)
    task = tmp_path / "task"
    assert runtime.prepare(settings, "gnina", task, SOURCE) == (IMPORTED, BOUND)
    profile["expires_at"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    atomic_json(settings.state_dir / leases.FILE, profile)
    with pytest.raises(RuntimeError, match="not active"):
        runtime.prepare(settings, "gnina", tmp_path / "new-task", SOURCE)
    assert runtime.prepare(settings, "gnina", task, SOURCE) == (IMPORTED, BOUND)
    assert runtime.read(task) == BOUND
    assert not (tmp_path / "new-task" / runtime.RECEIPT).exists()
    (settings.state_dir / leases.FILE).unlink()
    assert runtime.prepare(settings, "gnina", task, SOURCE) == (IMPORTED, BOUND)
    assert runtime.prepare(settings, "gnina", tmp_path / "restored-task", SOURCE)[0] == SOURCE


@pytest.mark.parametrize(
    "change", ["source_image", "source_entry", "image", "ttl", "owner", "schema", "socket"]
)
def test_invalid_or_rebound_profile_never_creates_task_snapshot(tmp_path, change):
    settings, root, profile = setup(tmp_path)
    entry = profile["engines"]["gnina"]
    if change == "source_image":
        entry["source_image"] = "sha256:" + "c" * 64
    elif change == "source_entry":
        entry["source_entry_sha256"] = "c" * 64
    elif change == "image":
        entry["image"] = "floating:latest"
    elif change == "ttl":
        profile["expires_at"] = (datetime.now(UTC) + timedelta(hours=7)).isoformat()
    elif change == "owner":
        profile["owner"] = "another-app"
    elif change == "schema":
        profile["schema"] = True
    else:
        entry["container_runtime"]["endpoint"] = "tcp://remote:2375"
    atomic_json(settings.state_dir / leases.FILE, profile)
    with pytest.raises((ValueError, RuntimeError)):
        runtime.prepare(settings, "gnina", tmp_path / "task", SOURCE)
    assert not (tmp_path / "task" / runtime.RECEIPT).exists()
    assert runtime.installed(settings, "gnina").value is None


def test_changed_installed_environment_invalidates_profile_instead_of_reusing_another_image(
    tmp_path,
):
    settings, root, profile = setup(tmp_path)
    atomic_json(root / "installed.json", {"gnina": {"image": SOURCE, "version": "changed"}})
    with pytest.raises(ValueError, match="original installed"):
        runtime.selection(settings, "gnina", SOURCE)


def test_corrupt_profile_is_not_a_silent_default_and_registry_digest_remains_supported(tmp_path):
    settings, root, profile = setup(tmp_path)
    atomic_json(settings.state_dir / leases.FILE, {})
    with pytest.raises(ValueError, match="engines mapping"):
        runtime.prepare(settings, "gnina", tmp_path / "task", SOURCE)
    (settings.state_dir / leases.FILE).unlink()
    pinned = "registry.example/gnina@" + SOURCE
    assert runtime.prepare(settings, "gnina", tmp_path / "registry-task", pinned)[0] == pinned


@pytest.mark.parametrize(
    "field,value",
    [
        ("lease_id", "invalid"),
        ("lease_expires_at", "2026-10-24T12:00:00"),
        ("source_image", "floating:latest"),
        ("runtime", None),
    ],
)
def test_invalid_frozen_provenance_cannot_redirect_cleanup(tmp_path, field, value):
    settings, root, profile = setup(tmp_path)
    task = tmp_path / "task"
    runtime.prepare(settings, "gnina", task, SOURCE)
    path = task / runtime.RECEIPT
    frozen = json.loads(path.read_text())
    frozen[field] = value
    atomic_json(path, frozen)
    with pytest.raises(ValueError):
        runtime.read(task)
