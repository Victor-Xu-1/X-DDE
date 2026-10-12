"""Archive boundaries, immutable merge and privacy closure; no scientific fixtures."""

import errno
import hashlib
import json
import os
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench.examples.bundle_archive import read_archive, safe_path, sha256
from opendde_workbench.examples.bundle_projection import references


def archive(tmp_path, members):
    target = tmp_path / "cases.zip"
    with zipfile.ZipFile(target, "w") as bundle:
        for name, data in members.items():
            bundle.writestr(name, data)
    return target


def test_reference_closure_never_follows_ids_in_user_text():
    private, public = str(uuid4()), str(uuid4())
    assert references(
        {
            "notes": private,
            "name": private,
            "description": {"id": private},
            "reference": {"asset_id": public},
        }
    ) == {public}


@pytest.mark.parametrize(
    "name", ["../private", "/etc/passwd", "C:/secret", "jobs/../secret", "jobs\\secret"]
)
def test_archive_paths_stay_owned(tmp_path, name):
    with pytest.raises(ValueError, match="Unsafe"):
        safe_path(tmp_path, name)


def test_symlink_parent_is_rejected(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (tmp_path / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="owned"):
        safe_path(tmp_path, "link/private")


def test_reviewed_digest_is_required_before_unpacking(tmp_path):
    bundle = archive(tmp_path, {"manifest.json": "{}"})
    with pytest.raises(ValueError, match="SHA-256"):
        read_archive(bundle, tmp_path / "staging", "0" * 64)
    assert not (tmp_path / "staging").exists()


def test_unlisted_and_duplicate_members_rejected(tmp_path):
    bundle = archive(
        tmp_path,
        {"manifest.json": json.dumps({"schema_version": 1, "files": {}}), "private.txt": "secret"},
    )
    with pytest.raises(ValueError, match="contents"):
        read_archive(bundle, tmp_path / "staging", sha256(bundle))


def test_verified_bytes_are_unpacked_once(tmp_path):
    data = b"Retained native protocol output"
    name = "jobs/example/output/result.json"
    manifest = {
        "schema_version": 1,
        "files": {name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}},
    }
    bundle = archive(tmp_path, {"manifest.json": json.dumps(manifest), name: data})
    assert read_archive(bundle, tmp_path / "staging", sha256(bundle)) == manifest
    assert (tmp_path / "staging" / name).read_bytes() == data


def test_modified_artifact_is_rejected(tmp_path):
    manifest = {"schema_version": 1, "files": {"result.json": {"sha256": "0" * 64, "bytes": 3}}}
    bundle = archive(tmp_path, {"manifest.json": json.dumps(manifest), "result.json": b"bad"})
    with pytest.raises(ValueError, match="byte-level"):
        read_archive(bundle, tmp_path / "staging", sha256(bundle))


def merge_archive(tmp_path, rows):
    from opendde_workbench.examples.bundle import catalogue_digest
    from opendde_workbench.examples.bundle_archive import write_archive
    from opendde_workbench.examples.bundle_projection import TABLES

    target = tmp_path / "merge.zip"
    write_archive(
        target,
        {
            "schema_version": 1,
            "catalogue_sha256": catalogue_digest(),
            "records": {name: rows.get(name, []) for name in TABLES},
        },
        {},
    )
    return target


def test_restore_is_idempotent_and_preserves_unrelated_projects(settings, tmp_path, monkeypatch):
    from opendde_workbench.api import create_app
    from opendde_workbench.examples import bundle
    from opendde_workbench.store import Store

    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    unrelated = str(uuid4())
    with store.connect() as db:
        db.execute(
            "INSERT INTO projects VALUES(?,?,?,?)",
            (unrelated, "Private user project", "Keep me", "today"),
        )
    public = {
        "id": str(uuid4()),
        "name": "Public protocol case",
        "description": "Public",
        "created_at": "today",
    }
    target = merge_archive(tmp_path, {"projects": [public]})
    monkeypatch.setattr(bundle, "verify_examples", lambda settings: {"modules": 0})
    bundle.restore_bundle(target, settings, sha256(target))
    bundle.restore_bundle(target, settings, sha256(target))
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM projects").fetchone()[0] == 2
        assert (
            db.execute("SELECT description FROM projects WHERE id=?", (unrelated,)).fetchone()[0]
            == "Keep me"
        )


def test_conflict_never_overwrites_existing_record(settings, tmp_path, monkeypatch):
    from opendde_workbench.api import create_app
    from opendde_workbench.examples import bundle
    from opendde_workbench.store import ConflictError, Store

    create_app(settings)
    identifier = str(uuid4())
    store = Store(settings.state_dir / "jobs.sqlite3")
    with store.connect() as db:
        db.execute(
            "INSERT INTO projects VALUES(?,?,?,?)", (identifier, "Existing", "Original", "today")
        )
    target = merge_archive(
        tmp_path,
        {
            "projects": [
                {
                    "id": identifier,
                    "name": "Replacement",
                    "description": "Changed",
                    "created_at": "today",
                }
            ]
        },
    )
    monkeypatch.setattr(bundle, "verify_examples", lambda settings: {"modules": 0})
    with pytest.raises(ConflictError, match="never overwrites"):
        bundle.restore_bundle(target, settings, sha256(target))
    with store.connect() as db:
        assert (
            db.execute("SELECT name FROM projects WHERE id=?", (identifier,)).fetchone()[0]
            == "Existing"
        )


def test_unknown_record_columns_rejected_before_sql(settings, tmp_path):
    from opendde_workbench.examples import bundle

    target = merge_archive(
        tmp_path, {"projects": [{"id": str(uuid4()), "arbitrary_sql": "DROP TABLE jobs"}]}
    )
    with pytest.raises(ValueError, match="record fields"):
        bundle.restore_bundle(target, settings, sha256(target))


def test_partial_case_notices_exclude_unrelated_sources_and_output_restrictions():
    from opendde_workbench.examples.bundle_notices import bundle_notices
    from opendde_workbench.examples.catalogue import CASES

    value = bundle_notices(
        ["biopython.exposure"],
        {"jobs": [{"request": json.dumps({"operation": "surface_exposure"})}]},
    )
    assert set(value["sources"]) == set(CASES["brd4-jq1"].sources)
    assert value["licenses"] == ["CC0-1.0"]
    assert "linker passage" in value["methods"]
    assert "DrugCLIP" not in json.dumps(value)
    retrieval = bundle_notices(
        ["drugclip.screen"], {"jobs": [{"request": json.dumps({"operation": "drugclip_retrieve"})}]}
    )
    assert any("CC-BY-NC-4.0" in license for license in retrieval["licenses"])


@pytest.fixture
def export_files(tmp_path):
    paths = {}
    for name in ("first", "second"):
        source = tmp_path / f"{name}.txt"
        source.write_bytes(f"{name} native artifact\n".encode())
        paths[f"outputs/{name}.txt"] = source
    return tmp_path / "exports" / "case.zip", {"schema_version": 1}, paths


def assert_export_roundtrip(target, manifest, paths, receipt, staging):
    assert receipt == {"sha256": sha256(target), "bytes": target.stat().st_size}
    restored = read_archive(target, staging, receipt["sha256"])
    assert restored == {
        **manifest,
        "files": {
            name: {"sha256": sha256(source), "bytes": source.stat().st_size}
            for name, source in paths.items()
        },
    }
    for name, source in paths.items():
        assert (staging / name).read_bytes() == source.read_bytes()
    assert list(target.parent.iterdir()) == [target]
    assert manifest == {"schema_version": 1}


def test_export_publishes_only_after_close_and_receipt(export_files, tmp_path, monkeypatch):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    original_link = os.link
    publications = []

    def publish(source, destination):
        assert destination == target and not target.exists()
        with zipfile.ZipFile(source) as archive:
            assert archive.testzip() is None
            assert set(archive.namelist()) == {"manifest.json", *paths}
        publications.append(source)
        original_link(source, destination)

    monkeypatch.setattr(os, "link", publish)
    receipt = bundle_archive.write_archive(target, manifest, paths)
    assert len(publications) == 1
    assert_export_roundtrip(target, manifest, paths, receipt, tmp_path / "restored")


@pytest.mark.parametrize("failure", ["member", "interrupt", "close", "hash", "stat", "publish"])
def test_failed_export_cleans_owned_staging_and_allows_retry(
    export_files, tmp_path, monkeypatch, failure
):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    originals = {path: path.read_bytes() for path in paths.values()}
    error = (
        KeyboardInterrupt("controlled interruption")
        if failure == "interrupt"
        else OSError(
            {"member": errno.ENOSPC, "publish": errno.EOPNOTSUPP}.get(failure, errno.EIO),
            "controlled export error",
        )
    )
    with monkeypatch.context() as patch:
        if failure in {"member", "interrupt"}:
            original_write = zipfile.ZipFile.write

            def fail_second_member(archive, source, name):
                if name == "outputs/second.txt":
                    raise error
                return original_write(archive, source, name)

            patch.setattr(zipfile.ZipFile, "write", fail_second_member)
        elif failure == "close":

            def fail_close(archive):
                raise error

            patch.setattr(zipfile.ZipFile, "_write_end_record", fail_close)
        elif failure == "hash":
            original_hash = bundle_archive.sha256

            def fail_receipt_hash(path):
                if path not in originals:
                    raise error
                return original_hash(path)

            patch.setattr(bundle_archive, "sha256", fail_receipt_hash)
        elif failure == "stat":
            original_stat = Path.stat

            def fail_receipt_stat(path, *args, **kwargs):
                if path.name == target.name:
                    raise error
                return original_stat(path, *args, **kwargs)

            patch.setattr(Path, "stat", fail_receipt_stat)
        else:

            def fail_publication(source, destination):
                raise error

            patch.setattr(os, "link", fail_publication)
        with pytest.raises(type(error)) as caught:
            bundle_archive.write_archive(target, manifest, paths)
        assert caught.value is error
    assert not target.exists()
    assert list(target.parent.iterdir()) == []
    assert {path: path.read_bytes() for path in paths.values()} == originals
    receipt = bundle_archive.write_archive(target, manifest, paths)
    assert_export_roundtrip(target, manifest, paths, receipt, tmp_path / "restored")


@pytest.mark.parametrize("timing", ["preexisting", "during_write", "at_publication"])
def test_export_never_overwrites_or_removes_another_destination(export_files, monkeypatch, timing):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    target.parent.mkdir()
    retained = b"A different caller owns this output."
    if timing == "preexisting":
        target.write_bytes(retained)
    elif timing == "during_write":
        original_write = zipfile.ZipFile.write

        def fail_after_other_writer(archive, source, name):
            original_write(archive, source, name)
            target.write_bytes(retained)
            raise OSError(errno.ENOSPC, "controlled writer failure")

        monkeypatch.setattr(zipfile.ZipFile, "write", fail_after_other_writer)
    else:
        original_link = os.link

        def lose_publication_race(source, destination):
            target.write_bytes(retained)
            original_link(source, destination)

        monkeypatch.setattr(os, "link", lose_publication_race)
    expected = OSError if timing == "during_write" else FileExistsError
    with pytest.raises(expected):
        bundle_archive.write_archive(target, manifest, paths)
    assert target.read_bytes() == retained
    assert list(target.parent.iterdir()) == [target]


def test_export_bundle_returns_receipt_and_preserves_source_asset(settings, tmp_path, monkeypatch):
    from types import SimpleNamespace

    from opendde_workbench.api import create_app
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.examples import bundle
    from opendde_workbench.store import Store

    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    raw = b'{"protocol": "archive consumer fixture, not a scientific result"}'
    asset = assets.save("protocol.json", "config", raw)
    summary = {"modules": 1, "computed": 0, "validated": 1}
    # Isolate public-case selection; archive, asset storage and row projection remain real.
    monkeypatch.setattr(bundle, "MODULES", {"fixture": SimpleNamespace(case_id="fixture")})
    monkeypatch.setattr(bundle, "CASES", {"fixture": SimpleNamespace(files=[])})
    monkeypatch.setattr(bundle, "verify_examples", lambda *args: summary)
    prepared = SimpleNamespace(model_dump=lambda **kwargs: {"asset_id": asset.id})
    monkeypatch.setattr(bundle, "prepare_example", lambda *args, **kwargs: prepared)
    monkeypatch.setattr(bundle, "bundle_notices", lambda *args: {})
    target = tmp_path / "exports" / "case.zip"
    receipt = bundle.export_bundle(settings, target, "fixture-revision", capabilities=["fixture"])
    assert receipt == {
        **summary,
        "sha256": sha256(target),
        "bytes": target.stat().st_size,
        "jobs": 0,
        "assets": 1,
    }
    restored = read_archive(target, tmp_path / "restored", receipt["sha256"])
    assert restored["source_revision"] == "fixture-revision"
    assert restored["records"]["assets"] == [asset.model_dump()]
    assert (tmp_path / "restored" / "assets" / asset.id / "content.json").read_bytes() == raw
    assert assets.path(asset).read_bytes() == raw
    assert assets.get(asset.id) == asset
    assert list(target.parent.iterdir()) == [target]


@pytest.mark.parametrize("failed_write", [False, True])
def test_export_cleanup_error_preserves_primary_error_or_receipt(
    export_files, tmp_path, monkeypatch, failed_write
):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    original_cleanup = bundle_archive.tempfile.TemporaryDirectory.cleanup
    cleanups = []
    error = OSError(errno.ENOSPC, "controlled primary error")

    def fail_cleanup(staging):
        cleanups.append(staging)
        raise PermissionError(errno.EACCES, "controlled cleanup error")

    def fail_write(*args, **kwargs):
        raise error

    try:
        with monkeypatch.context() as patch:
            patch.setattr(bundle_archive.tempfile.TemporaryDirectory, "cleanup", fail_cleanup)
            if failed_write:
                patch.setattr(zipfile.ZipFile, "write", fail_write)
                with pytest.raises(OSError) as caught:
                    bundle_archive.write_archive(target, manifest, paths)
                assert caught.value is error
                assert not target.exists()
            else:
                receipt = bundle_archive.write_archive(target, manifest, paths)
                assert receipt == {"sha256": sha256(target), "bytes": target.stat().st_size}
        assert len(cleanups) == 1
    finally:
        for staging in cleanups:
            original_cleanup(staging)
    if failed_write:
        assert list(target.parent.iterdir()) == []
    else:
        assert_export_roundtrip(target, manifest, paths, receipt, tmp_path / "restored")
