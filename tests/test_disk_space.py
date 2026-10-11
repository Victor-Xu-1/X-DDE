"""Real capacity contracts: never confuse VHD free space with the backing drive."""

import base64
import json
from types import SimpleNamespace

import pytest

from opendde_workbench import disk_space, wsl_storage


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(disk_space, "_cached", None)
    monkeypatch.setattr(disk_space, "_expires", 0)
    monkeypatch.setattr(disk_space, "_distribution", None)
    monkeypatch.delenv("WSL_DISTRO_NAME", raising=False)
    monkeypatch.setattr(disk_space.platform, "system", lambda: "Linux")
    monkeypatch.setattr(disk_space.platform, "release", lambda: "6.8-azure")


def native_free(monkeypatch, value):
    monkeypatch.setattr(disk_space.shutil, "disk_usage", lambda _: SimpleNamespace(free=value))


def wsl(monkeypatch):
    monkeypatch.setenv("WSL_DISTRO_NAME", "research WSL")
    monkeypatch.setattr(disk_space.platform, "release", lambda: "6.6-microsoft-standard-WSL2")


def test_native_linux_never_requires_windows_interop(monkeypatch):
    native_free(monkeypatch, 12345)
    monkeypatch.setattr(disk_space, "probe", lambda _: pytest.fail("Unexpected Windows query"))
    assert disk_space.available_bytes("/research") == 12345


def test_real_windows_path_uses_its_native_physical_capacity(monkeypatch):
    monkeypatch.setattr(disk_space.platform, "system", lambda: "Windows")
    monkeypatch.setenv("WSL_DISTRO_NAME", "ignored-on-Windows")
    native_free(monkeypatch, 123)
    assert disk_space.available_bytes("E:/research") == 123


@pytest.mark.parametrize(
    "native,physical,expected", [(87 * 1024**3, 0, 0), (100, 500, 100), (500, 100, 100)]
)
def test_effective_space_is_the_tighter_real_boundary(monkeypatch, native, physical, expected):
    wsl(monkeypatch)
    native_free(monkeypatch, native)
    monkeypatch.setattr(disk_space, "probe", lambda _: wsl_storage.BackingVolume("E:", physical))
    assert disk_space.available_bytes("/research") == expected


def test_expired_success_is_not_used_after_a_failed_physical_refresh(monkeypatch):
    wsl(monkeypatch)
    native_free(monkeypatch, 999)
    clock = [10.0]
    monkeypatch.setattr(disk_space.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(disk_space, "probe", lambda _: wsl_storage.BackingVolume("E:", 100))
    assert disk_space.available_bytes("/research") == 100
    clock[0] = 12

    def unavailable(_):
        raise wsl_storage.StorageUnavailable("Cannot verify free space on the host disk.")

    monkeypatch.setattr(disk_space, "probe", unavailable)
    with pytest.raises(wsl_storage.StorageUnavailable):
        disk_space.available_bytes("/research")
    assert disk_space._cached is None


def test_wsl_without_registration_identity_fails_closed(monkeypatch):
    native_free(monkeypatch, 87 * 1024**3)
    monkeypatch.setattr(disk_space.platform, "release", lambda: "6.6-microsoft-standard-WSL2")
    with pytest.raises(wsl_storage.StorageUnavailable, match="identify"):
        disk_space.available_bytes("/research")


@pytest.mark.parametrize("value", [True, -1, None, "999", 2**64])
def test_windows_probe_never_converts_invalid_capacity_to_zero(monkeypatch, value):
    monkeypatch.setattr(wsl_storage.shutil, "which", lambda _: "powershell.exe")
    monkeypatch.setattr(
        wsl_storage.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(
            returncode=0, stdout=json.dumps({"location": "E:", "free_bytes": value}).encode()
        ),
    )
    with pytest.raises(wsl_storage.StorageUnavailable):
        wsl_storage.probe("WSL")


def test_distribution_name_is_data_and_probe_never_starts_or_stops_wsl(monkeypatch):
    calls = []
    name = "research ' ; Write-Host injected"
    monkeypatch.setattr(wsl_storage.shutil, "which", lambda _: "powershell.exe")

    def process(arguments, **kwargs):
        calls.append((arguments, kwargs))
        return SimpleNamespace(returncode=0, stdout=b'{"location":"E:","free_bytes":123}')

    monkeypatch.setattr(wsl_storage.subprocess, "run", process)
    assert wsl_storage.probe(name).free_bytes == 123
    arguments, kwargs = calls[0]
    source = base64.b64decode(arguments[-1]).decode("utf-16-le")
    assert name not in source
    assert "Get-Volume -FilePath" in source
    assert "wsl.exe" not in source and "Set-" not in source and "Remove-" not in source
    assert kwargs["timeout"] == 8 and kwargs.get("shell", False) is False


def test_capacity_guard_rejects_the_full_backing_drive(monkeypatch):
    wsl(monkeypatch)
    native_free(monkeypatch, 87 * 1024**3)
    monkeypatch.setattr(disk_space, "probe", lambda _: wsl_storage.BackingVolume("E:", 0))
    with pytest.raises(disk_space.StorageCapacityError, match="storage drive"):
        disk_space.require_space("/research", 1)
