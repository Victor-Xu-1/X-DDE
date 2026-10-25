"""Private, boot-bound registered-volume identity; capacity is never cached here."""

import argparse
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path, PureWindowsPath
from uuid import UUID

from .locations import atomic_json
from .wsl_mount import host_mount

BOOT = Path("/proc/sys/kernel/random/boot_id")


def cache_path():
    state = os.environ.get("WB_STATE_DIR")
    if not state and os.environ.get("WB_HOME"):
        state = str(Path(os.environ["WB_HOME"]) / "state")
    if not state:
        return None
    path = Path(state)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("The storage identity needs an absolute platform state directory.")
    return path / "wsl-storage-identity.json"


def origin(value, distribution, *, fresh=False):
    if not isinstance(value, dict) or value.get("distribution") != distribution:
        raise ValueError("The registered volume belongs to another distribution.")
    location = value.get("location")
    if not isinstance(location, str) or not re.fullmatch(r"[A-Za-z]:", location):
        raise ValueError("The registered physical volume is not mapped.")
    volume = value.get("volume_id")
    if not isinstance(volume, str) or not 1 <= len(volume) <= 512:
        raise ValueError("The registered physical volume has no identity.")
    observed_text = value.get("observed_at_utc")
    if not isinstance(observed_text, str) or len(observed_text) > 80:
        raise ValueError("The Windows observation timestamp is invalid.")
    observed = datetime.fromisoformat(observed_text)
    if (
        observed.tzinfo is None
        or fresh
        and abs((datetime.now(UTC) - observed).total_seconds()) > 120
    ):
        raise ValueError("Obtain a fresh registered-volume observation from the Windows producer.")
    base = value.get("base_path")
    if not isinstance(base, str) or len(base) > 4096:
        raise ValueError("The registered distribution path is invalid.")
    base = PureWindowsPath(base.removeprefix("\\\\?\\"))
    if not base.is_absolute() or base.drive.upper() != location.upper() or ".." in base.parts:
        raise ValueError("The registered path differs from its backing volume.")
    mount = host_mount(location)
    if mount is None:
        raise ValueError("The registered physical volume has no unique live host mount.")
    directory = mount.joinpath(*base.parts[1:]).resolve(strict=True)
    if not directory.is_dir() or not directory.is_relative_to(mount.resolve()):
        raise ValueError("The registered distribution directory is not on its host volume.")
    return location, mount, directory.stat()


def load(distribution):
    path = cache_path()
    if path is None:
        return None
    if path.is_symlink():
        raise ValueError("The registered-volume identity must not be a symbolic link.")
    if not path.exists():
        return None
    metadata = path.lstat()
    if (
        path.is_symlink()
        or metadata.st_uid != os.getuid()
        or metadata.st_mode & 0o077
        or metadata.st_size > 8192
    ):
        raise ValueError("The registered-volume identity must be a bounded private owned file.")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or type(value.get("schema")) is not int or value["schema"] != 1:
        raise ValueError("The registered-volume identity schema is unsupported.")
    if not isinstance(value.get("boot_id"), str) or any(
        type(value.get(key)) is not int for key in ("base_dev", "base_ino")
    ):
        raise ValueError("The registered-volume binding is invalid.")
    if UUID(value["boot_id"]) != UUID(BOOT.read_text().strip()):
        return None  # A new boot requires the original Windows registry producer.
    location, mount, metadata = origin(value, distribution)
    if (metadata.st_dev, metadata.st_ino) != (value["base_dev"], value["base_ino"]):
        raise ValueError("The registered distribution storage identity changed.")
    return location, mount


def save(proof, distribution):
    path = cache_path()
    if path is None:
        return
    location, _, metadata = origin(proof, distribution, fresh=True)
    value = {
        key: proof[key]
        for key in (
            "distribution",
            "volume_id",
            "base_path",
            "observed_at_utc",
        )
    }
    value.update(
        schema=1,
        location=location,
        boot_id=str(UUID(BOOT.read_text().strip())),
        base_dev=metadata.st_dev,
        base_ino=metadata.st_ino,
    )
    if path.exists() or path.is_symlink():
        # Do not replace a foreign or unsafe metadata file during a refresh.
        existing = path.lstat()
        if path.is_symlink() or existing.st_uid != os.getuid() or existing.st_mode & 0o077:
            raise ValueError("The prior registered-volume identity is not privately owned.")
    atomic_json(path, value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host-proof", required=True, type=Path)
    args = parser.parse_args()
    if args.host_proof.stat().st_size > 8192:
        raise ValueError("The Windows producer observation exceeds its limit.")
    distribution = os.environ.get("WSL_DISTRO_NAME", "")
    if not distribution or cache_path() is None:
        raise ValueError("Use the actual distribution and platform state directory.")
    save(json.loads(args.host_proof.read_text(encoding="utf-8-sig")), distribution)
    assert load(distribution) is not None
    print(
        "Registered-volume identity verified; "
        "subsequent capacity reads use the live host filesystem."
    )


if __name__ == "__main__":
    main()
