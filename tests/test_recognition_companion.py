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
    planned = companion.prepare(host, resources)
    assert {path.relative_to(host).as_posix() for path in planned} == {
        "frontend/src/" + name for name in companion.NATIVE_FILES | companion.ADAPTERS.keys()
    }
    assert not backups.exists()
    assert all((host / p).read_bytes() == data for p, data in before.items())
    result = companion.apply(host, backups, resources, exclusive_source=True)
    assert result["changed"] == len(planned)
    saved = Path(result["backup"])
    assert all((saved / p).read_bytes() == data for p, data in before.items())
    assert len(json.loads((saved / "receipt.json").read_text())) == len(planned)
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
    adapter = host / "frontend/src" / next(iter(companion.ADAPTERS))
    adapter.write_text("owner adapter")
    with pytest.raises(ValueError, match="Existing adapter differs"):
        companion.apply(host, backups, resources, exclusive_source=True)
    assert adapter.read_text() == "owner adapter"


def test_upgrade_accepts_only_the_exact_previous_native_and_adapter_bytes(source):
    host, resources, backups = source
    manifest_path = resources / "patch.json"
    manifest = json.loads(manifest_path.read_text())
    record = next(item for item in manifest["files"] if item["path"].endswith("useWorkbench.ts"))
    native = host / record["path"]
    native.write_bytes(b"useWorkbench.ts: prior-reviewed")
    record["upgrades"] = [{
        "before_sha256": companion.digest(native.read_bytes()),
        "changes": [{"before": "prior-reviewed", "after": "localized"}],
    }]
    adapter = host / "frontend/src/recognition-host-bridge.ts"
    adapter.write_bytes(b"prior reviewed bridge")
    manifest["adapter_upgrades"] = {adapter.name: [companion.digest(adapter.read_bytes())]}
    manifest_path.write_text(json.dumps(manifest))
    result = companion.apply(host, backups, resources, exclusive_source=True)
    saved = Path(result["backup"])
    assert (saved / record["path"]).read_bytes() == b"useWorkbench.ts: prior-reviewed"
    saved_adapter = saved / "frontend/src/recognition-host-bridge.ts"
    assert saved_adapter.read_bytes() == b"prior reviewed bridge"
    assert native.read_bytes() == b"useWorkbench.ts: localized"
    assert adapter.read_bytes() == (resources / adapter.name).read_bytes()
    assert companion.prepare(host, resources) == {}


def test_upgrade_hunk_does_not_authorize_an_unrecognized_native_edit(source):
    host, resources, backups = source
    path = resources / "patch.json"
    manifest = json.loads(path.read_text())
    record = manifest["files"][0]
    record["upgrades"] = [{"before_sha256": "a" * 64, "changes": record["changes"]}]
    path.write_text(json.dumps(manifest))
    target = host / record["path"]
    target.write_bytes(b"owner edit original")
    with pytest.raises(ValueError, match="Unrecognized native source"):
        companion.apply(host, backups, resources, exclusive_source=True)
    assert target.read_bytes() == b"owner edit original"
    assert not backups.exists()


@pytest.mark.parametrize("installed", ["original", "historical", "localized"])
def test_final_step_reuses_verified_migrations(source, installed):
    host, resources, _ = source
    manifest_path = resources / "patch.json"
    manifest = json.loads(manifest_path.read_text())
    record = manifest["files"][0]
    target = host / record["path"]
    name = target.name
    payload = (name + ": current").encode()
    record["final_step"] = {
        "before_sha256": record["after_sha256"],
        "changes": [{"before": "localized", "after": "current"}],
    }
    record["after_sha256"] = companion.digest(payload)
    record["upgrades"] = [{
        "before_sha256": companion.digest((name + ": historical").encode()),
        "changes": [{"before": "historical", "after": "localized"}],
    }]
    manifest_path.write_text(json.dumps(manifest))
    target.write_text(name + ": " + installed)
    assert companion.prepare(host, resources)[target] == payload

    # The final hunk cannot make a broken predecessor appear deployable.
    record["final_step"]["before_sha256"] = "0" * 64
    manifest_path.write_text(json.dumps(manifest))
    if installed != "localized":
        with pytest.raises(ValueError, match="Native intermediate"):
            companion.prepare(host, resources)
    else:
        with pytest.raises(ValueError, match="Unrecognized native source"):
            companion.prepare(host, resources)


@pytest.mark.parametrize("installed", ["original", "localized", "previous"])
def test_companion_can_start_at_each_verified_intermediate(source, installed):
    host, resources, _ = source
    manifest_path = resources / "patch.json"
    manifest = json.loads(manifest_path.read_text())
    record = manifest["files"][0]
    target = host / record["path"]
    prefix = target.name + ": "
    payload = (prefix + "current").encode()
    record["final_steps"] = [
        {
            "before_sha256": companion.digest((prefix + before).encode()),
            "changes": [{"before": before, "after": after}],
        }
        for before, after in [("localized", "previous"), ("previous", "current")]
    ]
    record["after_sha256"] = companion.digest(payload)
    manifest_path.write_text(json.dumps(manifest))
    target.write_text(prefix + installed)
    assert companion.prepare(host, resources)[target] == payload

    record["final_steps"].append(record["final_steps"][1])
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Duplicate native intermediate"):
        companion.prepare(host, resources)


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
    for name, source in companion.ADAPTERS.items():
        assert mapping[source] == (
            "opendde_workbench/data/recognition_locale/" + name
        )


def test_native_foreground_retry_clears_the_old_error_at_its_explicit_entry():
    manifest = json.loads((companion.RESOURCES / "patch.json").read_text())
    record = next(item for item in manifest["files"] if item["path"].endswith("useXddeBridge.ts"))
    routes = [record["changes"], *(item["changes"] for item in record["upgrades"])]
    for changes in routes:
        handlers = [
            item["after"] for item in changes if "recognize: (file, signal)" in item["after"]
        ]
        assert len(handlers) == 1
        assert 'recognitionReady: () => latest.current.state.phase === "ready"' in handlers[0]
        handler = handlers[0].split("recognize:", 1)[1].split("loadMolecule:", 1)[0]
        assert handler.index('setError("")') < handler.index('foreground.current!.request')


def test_native_copy_and_download_use_the_same_verified_smiles_export():
    manifest = json.loads((companion.RESOURCES / "patch.json").read_text())
    record = next(item for item in manifest["files"] if item["path"].endswith("useWorkbench.ts"))
    for changes in [record["changes"], *(item["changes"] for item in record["upgrades"])]:
        updated = [item["after"] for item in changes]
        preparation = next(text for text in updated if "const validatedSmiles =" in text)
        assert "readPortableSmiles(current).then(" in preparation
        assert "structureGate.verify(smilesExport.revision)" in preparation
        assert "return smilesExport.text" in preparation
        assert '? validatedSmiles()' in updated
        assert '? validatedSmiles() + "\\n"' in updated
        assert '      setMolfile(recognizedDrawing(job.result));\n      setSmiles("");' in updated

    app = next(item for item in manifest["files"] if item["path"].endswith("/App.tsx"))
    for changes in [app["changes"], *(item["changes"] for item in app["upgrades"])]:
        assert any("smilesExport?.text" in item["after"] for item in changes)
        assert any("value={exportText}" in item["after"] for item in changes)

    final = [item["after"] for step in record["final_steps"] for item in step["changes"]]
    assert any("source?.revision === drawingRevision" in item for item in final)
    assert any("readPortableSmiles(current, result)" in item for item in final)
    assert any("readPortableSmiles(current, result, readSmiles)" in item for item in final)
    assert any("output_format: ChemicalMimeType.DaylightSmiles" in item for item in final)
    assert any("source.revision = structureGate.checkpoint()" in item for item in final)
    assert any("hasRelativeStereo(source.result.molfile)" in item for item in final)
    assert any("const text = await readRecognizedStereoFile(" in item for item in final)
    assert "    revokeRecovery();\n" in final
    assert any("source.recovery !== request" in item for item in final)
    assert any("source.recovery !== recovered.request" in item for item in final)
    app_final = [item["after"] for step in app["final_steps"] for item in step["changes"]]
    assert any("onLoadSuccess={bindRecognizedDrawing}" in item for item in app_final)
    assert any(
        'const drawing = sourceOnly ? "" : recognizedDrawing(job.result)' in item for item in final
    )
    assert any("inputBridgeOrigin() && sourceExport?.sourceOnly" in item for item in final)
    assert any("currentSourceExport() !== fallback" in item for item in final)
    assert any("recognitionDrawingOwner.current !== drawingOwner.current" in item for item in final)
    assert any("Boolean(sourceExport?.molfile)" in item for item in app_final)


def test_native_provider_serializes_before_any_service_consumer_can_bind_convert():
    manifest = json.loads((companion.RESOURCES / "patch.json").read_text())
    record = next(item for item in manifest["files"] if item["path"].endswith("MoleculeEditor.tsx"))
    routes = [record["changes"], *(item["changes"] for item in record["upgrades"])]
    for changes in routes:
        adapters = [
            item["after"] for item in changes if "const createStructService" in item["after"]
        ]
        assert len(adapters) == 1
        body = adapters[0]
        assert body.index("serializeKetcherConversions") < body.index("return engine;")
        assert "engine.convert.bind(engine)" in body
