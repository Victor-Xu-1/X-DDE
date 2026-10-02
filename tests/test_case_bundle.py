"""Archive boundaries, immutable merge and privacy closure; no scientific fixtures."""

import hashlib
import json
import zipfile
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
