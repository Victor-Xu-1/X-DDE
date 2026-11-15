"""Native locale source cutover, scope, backups and failure preservation only."""

import json
from pathlib import Path

import pytest

from opendde_workbench import recognition_companion as companion


@pytest.fixture
def source(tmp_path):
    host, resources = tmp_path / "host", tmp_path / "resources"
    native = host / "frontend/src"
    native.mkdir(parents=True)
    resources.mkdir()
    records = []
    for name in sorted(companion.NATIVE_FILES):
        original, updated = (name + ": original").encode(), (name + ": localized").encode()
        (native / name).write_bytes(original)
        records.append(
            {
                "path": "frontend/src/" + name,
                "before_sha256": companion.digest(original),
                "after_sha256": companion.digest(updated),
                "changes": [{"before": "original", "after": "localized"}],
            }
        )
    for name in companion.ADAPTERS:
        (resources / name).write_text("// canonical native adapter " + name)
    (resources / "patch.json").write_text(json.dumps({"schema_version": 1, "files": records}))
    return host, resources, tmp_path / "backups"


def test_check_is_read_only_and_apply_is_idempotent_with_exact_backups(source):
    host, resources, backups = source
    before = {p.relative_to(host): p.read_bytes() for p in host.rglob("*.tsx")}
    assert len(companion.prepare(host, resources)) == 5
    assert not backups.exists()
    assert all((host / p).read_bytes() == data for p, data in before.items())
    result = companion.apply(host, backups, resources, exclusive_source=True)
    assert result["changed"] == 5
    saved = Path(result["backup"])
    assert all((saved / p).read_bytes() == data for p, data in before.items())
    assert len(json.loads((saved / "receipt.json").read_text())) == 5
    assert companion.apply(host, backups, resources, exclusive_source=True) == {
        "changed": 0, "already_applied": True,
    }


def test_unknown_host_is_rejected_before_any_native_write(source):
    host, resources, backups = source
    original = (host / "frontend/src/App.tsx").read_bytes()
    (host / "frontend/src/StopConfirmation.tsx").write_text("owner edit")
    with pytest.raises(ValueError, match="Unrecognized native source"):
        companion.apply(host, backups, resources, exclusive_source=True)
    assert (host / "frontend/src/App.tsx").read_bytes() == original
    assert not backups.exists()


def test_native_file_permissions_survive_atomic_replacement(source):
    host, resources, backups = source
    native = host / "frontend/src/App.tsx"
    native.chmod(0o640)
    before = native.stat()
    companion.apply(host, backups, resources, exclusive_source=True)
    after = native.stat()
    assert after.st_mode & 0o777 == 0o640
    assert (after.st_uid, after.st_gid) == (before.st_uid, before.st_gid)


def test_existing_different_adapter_is_not_overwritten(source):
    host, resources, backups = source
    adapter = host / "frontend/src" / companion.ADAPTERS[0]
    adapter.write_text("owner adapter")
    with pytest.raises(ValueError, match="Existing adapter differs"):
        companion.apply(host, backups, resources, exclusive_source=True)
    assert adapter.read_text() == "owner adapter"


def test_manifest_cannot_expand_scope_or_escape_source(source):
    host, resources, _ = source
    manifest = json.loads((resources / "patch.json").read_text())
    manifest["files"][0]["path"] = "../outside"
    (resources / "patch.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Unexpected native integration scope"):
        companion.prepare(host, resources)


def test_symlinked_native_file_is_rejected(source, tmp_path):
    host, resources, _ = source
    native = host / "frontend/src/App.tsx"
    outside = tmp_path / "outside.tsx"
    outside.write_bytes(native.read_bytes())
    native.unlink()
    native.symlink_to(outside)
    with pytest.raises(ValueError, match="regular file"):
        companion.prepare(host, resources)


def test_failed_cutover_restores_only_our_unchanged_writes(source, monkeypatch):
    host, resources, backups = source
    before = {p: p.read_bytes() for p in host.rglob("*.tsx")}
    native = host / "frontend/src/App.tsx"
    native.chmod(0o440)
    original_metadata = native.stat()
    replace = companion.os.replace
    calls = 0

    def fail_second(source, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("controlled replacement failure")
        return replace(source, destination)

    monkeypatch.setattr(companion.os, "replace", fail_second)
    with pytest.raises(OSError, match="controlled"):
        companion.apply(host, backups, resources, exclusive_source=True)
    assert all(path.read_bytes() == data for path, data in before.items())
    assert not list(host.rglob("*.tmp"))
    assert list(backups.glob("*/receipt.json"))
    restored = native.stat()
    assert restored.st_mode & 0o777 == 0o440
    assert (restored.st_uid, restored.st_gid) == (
        original_metadata.st_uid, original_metadata.st_gid,
    )


def test_owner_deleted_file_does_not_abort_other_file_recovery(source, monkeypatch):
    host, resources, backups = source
    app = host / "frontend/src/App.tsx"
    original = app.read_bytes()
    deleted = host / "frontend/src/EditorBoundary.tsx"
    replace = companion.os.replace
    calls = 0

    def fail_third(source, destination):
        nonlocal calls
        calls += 1
        if calls == 3:
            deleted.unlink()
            raise OSError("original cutover failure")
        return replace(source, destination)

    monkeypatch.setattr(companion.os, "replace", fail_third)
    with pytest.raises(OSError, match="original cutover failure") as caught:
        companion.apply(host, backups, resources, exclusive_source=True)
    assert app.read_bytes() == original
    assert not deleted.exists()
    assert any("owner change" in note for note in caught.value.__notes__)


def test_apply_requires_explicit_offline_source_ownership(source):
    host, resources, backups = source
    with pytest.raises(ValueError, match="exclusive writer"):
        companion.apply(host, backups, resources)
    assert not backups.exists()


def test_backups_cannot_be_placed_inside_the_native_source(source):
    host, resources, _ = source
    with pytest.raises(ValueError, match="outside the source tree"):
        companion.apply(host, host / "backups", resources, exclusive_source=True)


def test_published_manifest_is_bounded_and_wheel_ships_canonical_adapters():
    import tomllib

    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((companion.RESOURCES / "patch.json").read_text())
    assert {entry["path"] for entry in manifest["files"]} == {
        "frontend/src/" + name for name in companion.NATIVE_FILES
    }
    config = tomllib.loads((root / "pyproject.toml").read_text())
    mapping = config["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
    for name in companion.ADAPTERS:
        assert mapping["frontend/src/utilities/" + name] == (
            "opendde_workbench/data/recognition_locale/" + name
        )
