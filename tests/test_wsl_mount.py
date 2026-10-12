"""Real mount identities and fresh physical-capacity reads, without interop per poll."""

from types import SimpleNamespace

import pytest

from opendde_workbench import disk_space
from opendde_workbench.wsl_mount import host_mount
from opendde_workbench.wsl_storage import BackingVolume, StorageUnavailable


def row(source="E:\\134", target="/mnt/e", filesystem="9p", root="/", options=None):
    options = options or "rw,aname=drvfs;path=E:\\134;uid=1000"
    return f"857 806 0:116 {root} {target} rw,noatime - {filesystem} {source} {options}\n"


def test_observed_plan9_drive_is_resolved_from_mount_metadata(tmp_path):
    file = tmp_path / "mountinfo"
    file.write_text(row(target="/custom/drive\\040E"))
    assert str(host_mount("e:", file)) == "/custom/drive E"


@pytest.mark.parametrize(
    "content",
    [
        row(source="C:\\134"),
        row(filesystem="ext4"),
        row(root="/research"),
        row(options="rw,aname=other;path=E:\\134"),
        "malformed mount",
        row(target="relative"),
    ],
)
def test_unrelated_or_untrusted_mounts_are_not_a_backing_volume(tmp_path, content):
    file = tmp_path / "mountinfo"
    file.write_text(content)
    assert host_mount("E:", file) is None


def test_ambiguous_mounts_do_not_choose_one_arbitrarily(tmp_path):
    file = tmp_path / "mountinfo"
    file.write_text(row() + row(target="/other/e"))
    assert host_mount("E:", file) is None


def test_unknown_volume_or_absent_mount_table_requires_registration_probe(tmp_path):
    assert host_mount("Host storage", tmp_path / "absent") is None
    assert host_mount("E:", tmp_path / "absent") is None


@pytest.fixture
def mapped(monkeypatch):
    monkeypatch.setattr(disk_space.platform, "system", lambda: "Linux")
    monkeypatch.setattr(disk_space.platform, "release", lambda: "microsoft-WSL2")
    monkeypatch.setenv("WSL_DISTRO_NAME", "registered research")
    monkeypatch.setattr(disk_space, "_distribution", "registered research")
    monkeypatch.setattr(disk_space, "_cached", BackingVolume("E:", 999))
    monkeypatch.setattr(disk_space, "_expires", 0)
    monkeypatch.setattr(disk_space, "host_mount", lambda _: "/actual/e")
    monkeypatch.setattr(disk_space, "probe", lambda _: pytest.fail("Repeated Windows process"))


def test_expired_interop_number_is_not_used_instead_of_live_physical_space(mapped, monkeypatch):
    remaining = [300]
    monkeypatch.setattr(
        disk_space.shutil,
        "disk_usage",
        lambda path: SimpleNamespace(free=remaining[0] if path == "/actual/e" else 500),
    )
    assert disk_space.available_bytes("/research") == 300
    remaining[0] = 0
    with pytest.raises(disk_space.StorageCapacityError):
        disk_space.require_space("/research", 1)


def test_disappearing_backing_mount_fails_closed_without_stale_value(mapped, monkeypatch):
    def unavailable(path):
        if path == "/actual/e":
            raise OSError("Drive removed")
        return SimpleNamespace(free=500)

    monkeypatch.setattr(disk_space.shutil, "disk_usage", unavailable)
    with pytest.raises(StorageUnavailable):
        disk_space.available_bytes("/research")
    assert disk_space._cached is None


@pytest.mark.parametrize("remaining", [True, -1, None, 2**64])
def test_invalid_live_capacity_never_uses_last_good_value(mapped, monkeypatch, remaining):
    monkeypatch.setattr(
        disk_space.shutil,
        "disk_usage",
        lambda path: SimpleNamespace(free=remaining if path == "/actual/e" else 500),
    )
    with pytest.raises(StorageUnavailable):
        disk_space.available_bytes("/research")
    assert disk_space._cached is None


def test_distribution_change_requires_a_new_registration_query(mapped, monkeypatch):
    monkeypatch.setenv("WSL_DISTRO_NAME", "another distribution")
    calls = []

    def registered(name):
        calls.append(name)
        return BackingVolume("F:", 123)

    monkeypatch.setattr(disk_space, "probe", registered)
    monkeypatch.setattr(disk_space.shutil, "disk_usage", lambda _: SimpleNamespace(free=500))
    assert disk_space.available_bytes("/research") == 123
    assert calls == ["another distribution"]
