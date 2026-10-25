"""Real filesystem identity and fresh-capacity contracts, without starting WSL."""

import json
import os
import subprocess
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from opendde_workbench import wsl_storage
from opendde_workbench import wsl_storage_identity as identity


@pytest.fixture
def registered(monkeypatch, tmp_path):
    state, host = tmp_path / "state", tmp_path / "host"
    state.mkdir()
    (host / "system").mkdir(parents=True)
    monkeypatch.setenv("WB_STATE_DIR", str(state))
    monkeypatch.setattr(identity, "host_mount", lambda location: host if location == "E:" else None)
    monkeypatch.setattr(
        wsl_storage, "host_mount", lambda location: host if location == "E:" else None
    )
    proof = {
        "distribution": "research WSL",
        "location": "E:",
        "base_path": "E:\\system",
        "volume_id": "volume-identity-fixture",
        "observed_at_utc": datetime.now(UTC).isoformat(),
        "free_bytes": 999999999,
    }
    return proof, identity.cache_path(), host


def test_boot_bound_identity_never_retains_capacity_and_reads_the_live_drive(
    registered, monkeypatch
):
    proof, path, _ = registered
    identity.save(proof, proof["distribution"])
    record = json.loads(path.read_text())
    assert "free_bytes" not in record and path.stat().st_mode & 0o077 == 0
    monkeypatch.setattr(
        wsl_storage.subprocess,
        "run",
        lambda *a, **k: pytest.fail("Interop must not run for a verified same-boot identity"),
    )
    available = [13]
    monkeypatch.setattr(
        wsl_storage.shutil, "disk_usage", lambda _: SimpleNamespace(free=available[0])
    )
    assert wsl_storage.probe(proof["distribution"]).free_bytes == 13
    available[0] = 0
    assert wsl_storage.probe(proof["distribution"]).free_bytes == 0


@pytest.mark.parametrize(
    "field,value",
    [
        ("schema", True),
        ("schema", 2),
        ("distribution", "other distro"),
        ("base_path", "C:\\system"),
        ("volume_id", ""),
        ("base_ino", -1),
    ],
)
def test_invalid_identity_fails_closed_without_windows_fallback(
    registered, monkeypatch, field, value
):
    proof, path, _ = registered
    identity.save(proof, proof["distribution"])
    changed = json.loads(path.read_text())
    changed[field] = value
    path.write_text(json.dumps(changed))
    monkeypatch.setattr(
        wsl_storage.subprocess,
        "run",
        lambda *a, **k: pytest.fail("Invalid metadata must not be silently replaced"),
    )
    with pytest.raises(wsl_storage.StorageUnavailable):
        wsl_storage.probe(proof["distribution"])


def test_new_boot_requires_the_original_registry_producer_not_cached_capacity(
    registered, monkeypatch
):
    proof, path, _ = registered
    identity.save(proof, proof["distribution"])
    changed = json.loads(path.read_text())
    changed["boot_id"] = str(uuid4())
    path.write_text(json.dumps(changed))
    assert identity.load(proof["distribution"]) is None
    monkeypatch.setattr(wsl_storage.shutil, "which", lambda _: "powershell.exe")

    def unavailable(*args, **kwargs):
        raise subprocess.TimeoutExpired("controlled-windows-producer", 8)

    monkeypatch.setattr(wsl_storage.subprocess, "run", unavailable)
    with pytest.raises(wsl_storage.StorageUnavailable):
        wsl_storage.probe(proof["distribution"])


@pytest.mark.parametrize("mode", ["public", "symlink", "unmounted", "replaced_directory"])
def test_private_file_mount_and_registered_directory_are_revalidated(registered, monkeypatch, mode):
    proof, path, host = registered
    identity.save(proof, proof["distribution"])
    if mode == "public":
        path.chmod(0o644)
    elif mode == "symlink":
        original = path.with_suffix(".original")
        path.rename(original)
        path.symlink_to(original)
    elif mode == "unmounted":
        monkeypatch.setattr(identity, "host_mount", lambda _: None)
    else:
        (host / "system").rename(host / "old-system")
        (host / "system").mkdir()
    with pytest.raises((ValueError, OSError)):
        identity.load(proof["distribution"])


def test_stale_host_observation_is_not_adopted(registered):
    proof, _, _ = registered
    proof["observed_at_utc"] = (datetime.now(UTC) - timedelta(minutes=10)).isoformat()
    with pytest.raises(ValueError, match="fresh"):
        identity.save(proof, proof["distribution"])


def test_successful_original_probe_persists_only_its_registered_identity(registered, monkeypatch):
    proof, path, _ = registered
    monkeypatch.setattr(wsl_storage.shutil, "which", lambda _: "powershell.exe")
    monkeypatch.setattr(
        wsl_storage.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=json.dumps(proof).encode()),
    )
    assert wsl_storage.probe(proof["distribution"]).free_bytes == proof["free_bytes"]
    assert identity.load(proof["distribution"])[0] == "E:"
    assert "free_bytes" not in json.loads(path.read_text())


def test_foreign_owner_cannot_supply_identity(registered, monkeypatch):
    proof, path, _ = registered
    identity.save(proof, proof["distribution"])
    owner = path.stat().st_uid
    monkeypatch.setattr(os, "getuid", lambda: owner + 1)
    with pytest.raises(ValueError, match="owned"):
        identity.load(proof["distribution"])
