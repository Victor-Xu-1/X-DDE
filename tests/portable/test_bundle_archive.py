"""Portable archive publication with real tiny files; no platform server imports.

Run alone with --confcutdir=tests/portable to avoid Unix-only server fixtures.
The Ubuntu bundle gate also runs these exact cases alongside its API consumers.
"""

import errno
import os
import zipfile
from pathlib import Path

import pytest

from opendde_workbench.examples.bundle_archive import read_archive, sha256


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
            original_write = bundle_archive._write_member

            def fail_second_member(archive, source, name, evidence):
                if name == "outputs/second.txt":
                    raise error
                return original_write(archive, source, name, evidence)

            patch.setattr(bundle_archive, "_write_member", fail_second_member)
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
        original_write = bundle_archive._write_member

        def fail_after_other_writer(archive, source, name, evidence):
            original_write(archive, source, name, evidence)
            target.write_bytes(retained)
            raise OSError(errno.ENOSPC, "controlled writer failure")

        monkeypatch.setattr(bundle_archive, "_write_member", fail_after_other_writer)
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
                patch.setattr(bundle_archive, "_write_member", fail_write)
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


def test_native_sized_member_above_legacy_limit_roundtrips_without_truncation(tmp_path):
    from opendde_workbench.examples import bundle_archive

    source = tmp_path / "full-cohort.sqlite"
    with source.open("wb") as stream:
        stream.truncate(64 * 1024**2 + 4096)
    target = tmp_path / "exports/case.zip"
    receipt = bundle_archive.write_archive(
        target, {"schema_version": 1}, {"jobs/reviewed/output/analysis.sqlite": source}
    )
    restored = tmp_path / "restored"
    manifest = read_archive(target, restored, receipt["sha256"])
    native = restored / "jobs/reviewed/output/analysis.sqlite"
    assert native.stat().st_size == source.stat().st_size
    assert sha256(native) == sha256(source)
    assert (
        manifest["files"]["jobs/reviewed/output/analysis.sqlite"]["bytes"] == native.stat().st_size
    )


@pytest.mark.parametrize("limit", ["file", "total", "manifest", "members"])
def test_export_rejects_unrestorable_budgets_before_publication(export_files, monkeypatch, limit):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    field = {
        "file": "MAX_FILE",
        "total": "MAX_TOTAL",
        "manifest": "MAX_MANIFEST",
        "members": "MAX_MEMBERS",
    }[limit]
    monkeypatch.setattr(bundle_archive, field, 1)
    with pytest.raises(ValueError, match="bounded|file limit"):
        bundle_archive.write_archive(target, manifest, paths)
    assert not target.exists()
    assert list(target.parent.iterdir()) == []


@pytest.mark.parametrize("limit", ["MAX_FILE", "MAX_TOTAL", "MAX_MANIFEST", "MAX_MEMBERS"])
def test_import_rejects_the_same_budgets_before_extracting(
    export_files, tmp_path, monkeypatch, limit
):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    receipt = bundle_archive.write_archive(target, manifest, paths)
    monkeypatch.setattr(bundle_archive, limit, 1)
    staging = tmp_path / "restored"
    with pytest.raises(ValueError):
        read_archive(target, staging, receipt["sha256"])
    assert not staging.exists()


@pytest.mark.parametrize("change", ["same_size", "grow", "shrink"])
def test_changed_native_source_never_publishes_a_false_manifest(export_files, monkeypatch, change):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    original = bundle_archive._write_member

    def mutate_before_stream(archive, source, name, evidence):
        value = source.read_bytes()
        source.write_bytes(
            b"X" * len(value)
            if change == "same_size"
            else value + b"growth"
            if change == "grow"
            else value[:-1]
        )
        return original(archive, source, name, evidence)

    monkeypatch.setattr(bundle_archive, "_write_member", mutate_before_stream)
    with pytest.raises(ValueError, match="grew|changed"):
        bundle_archive.write_archive(target, manifest, paths)
    assert not target.exists()
    assert list(target.parent.iterdir()) == []


@pytest.mark.parametrize("name", ["../private", "jobs/../private", "manifest.json"])
def test_export_rejects_unsafe_or_reserved_paths(export_files, monkeypatch, name):
    from opendde_workbench.examples import bundle_archive

    target, manifest, paths = export_files
    with pytest.raises(ValueError, match="Unsafe|reserved"):
        bundle_archive.write_archive(target, manifest, {name: next(iter(paths.values()))})
    assert not target.exists()
