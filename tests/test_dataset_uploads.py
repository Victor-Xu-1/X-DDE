"""Real chunk transfers, byte identities, quota and trust boundaries only."""

import gzip
import hashlib
from uuid import uuid4

import pytest

from opendde_workbench.asset_uploads import UploadInput, UploadStore
from opendde_workbench.assets import AssetStore
from opendde_workbench.store import ConflictError, Store


@pytest.fixture
def transfers(tmp_path):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets", max_total=128)
    return UploadStore(assets, 1024**2, 2 * 1024**2, 0)


def add_chunk(transfers, key, offset, data):
    return transfers.append(key, offset, data, hashlib.sha256(data).hexdigest())


def test_restart_resume_byte_identity_and_idempotent_complete(transfers):
    content = b"compound_id,target,control\nA035-B040-C030,92,3\n"
    key = uuid4()
    value = UploadInput(name="DEL006.csv", kind="counts", size=len(content))
    transfers.create(value, key)
    first = content[:21]
    assert add_chunk(transfers, key, 0, first)["offset"] == len(first)
    restarted = UploadStore(transfers.assets, transfers.max_file, transfers.quota, 0)
    assert restarted.create(value, key)["offset"] == len(first)
    assert add_chunk(restarted, key, 0, first)["offset"] == len(first)
    assert add_chunk(restarted, key, len(first), content[len(first) :])["offset"] == len(content)
    result = restarted.finalize(key)
    assert result.kind == "counts"
    assert result.sha256 == hashlib.sha256(content).hexdigest()
    assert restarted.assets.path(result).read_bytes() == content
    assert restarted.finalize(key) == result
    assert len(restarted.assets.list()) == 1


def test_wrong_resume_corruption_and_premature_publication_are_rejected(transfers):
    key = uuid4()
    transfers.create(UploadInput(name="Enamine.csv", kind="library", size=12), key)
    with pytest.raises(ConflictError):
        transfers.finalize(key)
    with pytest.raises(ValueError, match="integrity"):
        transfers.append(key, 0, b"hello", "0" * 64)
    add_chunk(transfers, key, 0, b"SMILES,ID\nx\n")
    with pytest.raises(ConflictError):
        add_chunk(transfers, key, 0, b"X")
    transfers.path(transfers.get(key)).write_bytes(b"SMILES,ID\ny\n")
    with pytest.raises(ValueError, match="changed"):
        transfers.finalize(key)
    assert not transfers.assets.list()


def test_data_quota_does_not_consume_legacy_small_input_budget(transfers):
    data = gzip.compress(
        b"".join(f"@read{index}\nACGT\n+\nIIII\n".encode() for index in range(200))
    )
    assert len(data) > transfers.assets.max_total
    key = uuid4()
    transfers.create(UploadInput(name="reads.fastq.gz", kind="reads", size=len(data)), key)
    add_chunk(transfers, key, 0, data)
    result = transfers.finalize(key)
    assert result.suffix == ".fastq.gz"
    assert transfers.assets.save("new.json", "config", b'{"new":true}').kind == "config"
    with pytest.raises(ValueError, match="resumable"):
        transfers.assets.save("counts.csv", "counts", b"a,b\n1,2\n")


def test_key_collision_overbudget_and_cancel_are_bounded(transfers):
    key = uuid4()
    value = UploadInput(name="library.sdf", kind="library", size=1024)
    transfers.create(value, key)
    with pytest.raises(ConflictError):
        transfers.create(UploadInput(name="other.sdf", kind="library", size=1024), key)
    with pytest.raises(ValueError, match="file budget"):
        transfers.create(UploadInput(name="large.sdf", kind="library", size=1024**2 + 1), uuid4())
    add_chunk(transfers, key, 0, b"partial")
    assert transfers.cancel(key)["state"] == "cancelled"
    assert transfers.cancel(key)["state"] == "cancelled"
    with pytest.raises(ConflictError):
        add_chunk(transfers, key, 7, b"x")
    assert not transfers.assets.list()


def test_reserved_quota_and_uncommitted_tail_recovery(transfers):
    first, second = uuid4(), uuid4()
    for key in (first, second):
        transfers.create(UploadInput(name="data.csv", kind="counts", size=1024**2), key)
    with pytest.raises(ValueError, match="storage budget"):
        transfers.create(UploadInput(name="extra.csv", kind="counts", size=1), uuid4())
    path = transfers.path(transfers.get(first))
    path.write_bytes(b"uncommitted crash tail")
    assert add_chunk(transfers, first, 0, b"ID,value\n")["offset"] == 9
    assert path.read_bytes() == b"ID,value\n"
    assert transfers.cancel(second)["state"] == "cancelled"
    transfers.create(UploadInput(name="another.csv", kind="counts", size=128), uuid4())


def test_utf8_boundary_and_invalid_compressed_content(transfers):
    content = "货号,结构\nAB123,C[C@H](O)c1ccccc1\n".encode()
    key = uuid4()
    transfers.create(UploadInput(name="MCE.csv", kind="library", size=len(content)), key)
    for position in range(len(content)):
        add_chunk(transfers, key, position, content[position : position + 1])
    assert transfers.finalize(key).sha256 == hashlib.sha256(content).hexdigest()
    bad = uuid4()
    transfers.create(UploadInput(name="bad.csv.gz", kind="library", size=4), bad)
    add_chunk(transfers, bad, 0, b"fake")
    with pytest.raises(ValueError, match="GZIP"):
        transfers.finalize(bad)


def test_api_upload_trust_and_request_limits(client_factory):
    content = b"SMILES,ID\nCOc1ccccc1,Catalogue-01\n"
    with client_factory() as client:
        key = str(uuid4())
        value = {"name": "ChemDiv.csv", "kind": "library", "size": len(content)}
        assert (
            client.post(
                "/api/assets/uploads",
                json=value,
                headers={"Idempotency-Key": key, "Origin": "https://untrusted.example"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/assets/uploads",
                json=value,
                headers={"Idempotency-Key": key, "X-Workbench-CSRF": "bad"},
            ).status_code
            == 403
        )
        created = client.post("/api/assets/uploads", json=value, headers={"Idempotency-Key": key})
        assert created.status_code == 201
        assert created.json()["offset"] == 0
        assert client.post(f"/api/assets/uploads/{key}/complete").status_code == 409
        response = client.put(
            f"/api/assets/uploads/{key}?offset=0",
            content=content,
            headers={"X-Chunk-SHA256": hashlib.sha256(content).hexdigest()},
        )
        assert response.status_code == 200
        asset = client.post(f"/api/assets/uploads/{key}/complete")
        assert asset.status_code == 200
        assert asset.json()["kind"] == "library"
        assert client.get(f"/api/assets/{asset.json()['id']}").content == content
        assert client.get(f"/api/assets/uploads/{key}/chunks").json()[0]["size"] == len(content)
        assert (
            client.put(
                f"/api/assets/uploads/{key}?offset=0",
                content=b"x" * (4 * 1024**2 + 1),
                headers={"X-Chunk-SHA256": "0" * 64},
            ).status_code
            == 413
        )


def reopen_transfers(transfers):
    assets = AssetStore(Store(transfers.assets.store.path), transfers.assets.root)
    return UploadStore(assets, transfers.max_file, transfers.quota, 0)


def staged_transfer(transfers, data=b"ID,value\nA,1\n"):
    key = uuid4()
    transfers.create(UploadInput(name="counts.csv", kind="counts", size=len(data)), key)
    add_chunk(transfers, key, 0, data)
    return key, transfers.path(transfers.get(key))


@pytest.mark.parametrize("operation", ["unlink", "rmdir"])
def test_cancel_retries_failed_cleanup_after_reopen(transfers, monkeypatch, operation):
    import errno
    from pathlib import Path

    key, path = staged_transfer(transfers)
    transfers.max_file = transfers.quota = 13
    target = path if operation == "unlink" else path.parent
    original = getattr(Path, operation)

    def fail_owned(self, *args, **kwargs):
        if self == target:
            raise OSError(errno.EIO, "controlled cleanup failure")
        return original(self, *args, **kwargs)

    with monkeypatch.context() as fault:
        fault.setattr(Path, operation, fail_owned)
        with pytest.raises(OSError) as failure:
            transfers.cancel(key)
        assert failure.value.errno == errno.EIO
    assert transfers.get(key)["state"] == "cancelled"
    assert path.exists() == (operation == "unlink")
    assert path.parent.exists()
    restarted = reopen_transfers(transfers)
    with pytest.raises(ValueError, match="storage budget"):
        restarted.create(UploadInput(name="next.csv", kind="counts", size=13), uuid4())
    assert restarted.cancel(key)["state"] == "cancelled"
    assert not path.parent.exists()
    assert restarted.cancel(key)["state"] == "cancelled"
    assert restarted.chunks(key)[0]["size"] == 13
    restarted.create(UploadInput(name="next.csv", kind="counts", size=13), uuid4())


@pytest.mark.parametrize("boundary", ["before_cleanup", "after_cleanup"])
def test_cancel_interrupted_transaction_is_recoverable(transfers, monkeypatch, boundary):
    key, path = staged_transfer(transfers)
    original = transfers._cleanup_cancelled

    def interrupt(row):
        if boundary == "after_cleanup":
            original(row)
        raise KeyboardInterrupt("controlled interruption before marker commit")

    with monkeypatch.context() as fault:
        fault.setattr(transfers, "_cleanup_cancelled", interrupt)
        with pytest.raises(KeyboardInterrupt):
            transfers.cancel(key)
    assert transfers.get(key)["state"] == "cancelled"
    with transfers.assets.store.connect() as db:
        assert db.execute("SELECT upload_id FROM asset_upload_cleanup").fetchone()[0] == str(key)
    restarted = reopen_transfers(transfers)
    assert restarted.cancel(key)["state"] == "cancelled"
    assert not path.parent.exists()
    with restarted.assets.store.connect() as db:
        assert not db.execute("SELECT upload_id FROM asset_upload_cleanup").fetchone()


@pytest.mark.parametrize("missing", ["content", "folder"])
def test_cancel_accepts_already_missing_owned_paths(transfers, missing):
    key, path = staged_transfer(transfers)
    path.unlink()
    if missing == "folder":
        path.parent.rmdir()
    assert transfers.cancel(key)["state"] == "cancelled"
    assert not path.parent.exists()


def test_legacy_cancelled_rows_enroll_once_without_deleting_history(transfers, monkeypatch):
    from pathlib import Path

    retained, path = staged_transfer(transfers)
    cleaned, gone = staged_transfer(transfers)
    transfers.cancel(cleaned)
    with transfers.assets.store.connect() as db:
        db.execute("UPDATE asset_uploads SET state='cancelled' WHERE id=?", (str(retained),))
        db.execute("DROP TABLE asset_upload_cleanup")
    transfers.max_file = transfers.quota = 13
    restarted = reopen_transfers(transfers)
    assert path.read_bytes() == b"ID,value\nA,1\n"
    assert not gone.parent.exists()
    with restarted.assets.store.connect() as db:
        assert [r[0] for r in db.execute("SELECT upload_id FROM asset_upload_cleanup")] == [
            str(retained)
        ]
    with pytest.raises(ValueError, match="storage budget"):
        restarted.create(UploadInput(name="next.csv", kind="counts", size=13), uuid4())
    original = Path.lstat

    def no_rescan(self, *args, **kwargs):
        if self == path.parent:
            raise AssertionError("legacy migration must not repeat")
        return original(self, *args, **kwargs)

    with monkeypatch.context() as fault:
        fault.setattr(Path, "lstat", no_rescan)
        reopen_transfers(restarted)
    restarted.cancel(retained)
    assert restarted.get(cleaned)["state"] == "cancelled"
    assert len(restarted.chunks(retained)) == 1
    restarted.create(UploadInput(name="next.csv", kind="counts", size=13), uuid4())


@pytest.mark.parametrize("link_at", ["root", "folder", "content"])
def test_cancel_rejects_symlinks_and_preserves_other_files(transfers, tmp_path, link_at):
    key, path = staged_transfer(transfers)
    other, other_path = staged_transfer(transfers)
    external = tmp_path / "external"
    external.mkdir()
    protected = external / "content"
    protected.write_bytes(b"keep")
    if link_at == "content":
        path.unlink()
        path.symlink_to(protected)
    elif link_at == "folder":
        path.unlink()
        path.parent.rmdir()
        path.parent.symlink_to(external, target_is_directory=True)
    else:
        transfers.root.rename(transfers.root.with_name("saved-uploads"))
        transfers.root.symlink_to(external, target_is_directory=True)
    with pytest.raises(ValueError, match="unsafe"):
        transfers.cancel(key)
    assert protected.read_bytes() == b"keep"
    if link_at != "root":
        assert other_path.read_bytes() == b"ID,value\nA,1\n"
        assert transfers.get(other)["state"] == "uploading"


def test_cancel_never_removes_registered_assets_or_unowned_siblings(transfers):
    key, path = staged_transfer(transfers)
    asset = transfers.finalize(key)
    registered = transfers.assets.path(asset)
    with pytest.raises(ConflictError, match="registered"):
        transfers.cancel(key)
    assert registered.read_bytes() == b"ID,value\nA,1\n"
    other, staged = staged_transfer(transfers)
    sibling = staged.parent / "unowned"
    sibling.write_bytes(b"preserve")
    with pytest.raises(OSError):
        transfers.cancel(other)
    assert sibling.read_bytes() == b"preserve"
    assert not staged.exists()
    sibling.unlink()
    transfers.cancel(other)
    assert not staged.parent.exists()


@pytest.mark.parametrize("operation", ["append", "finalize"])
def test_cancel_wins_against_inflight_append_or_finalize(transfers, monkeypatch, operation):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    import opendde_workbench.asset_uploads as upload_module

    key, path = staged_transfer(transfers)
    reached, resume = Event(), Event()
    if operation == "append":
        original = transfers.path

        def pause(row):
            result = original(row)
            reached.set()
            assert resume.wait(5)
            return result

        monkeypatch.setattr(transfers, "path", pause)

        def action():
            return add_chunk(transfers, key, 0, b"ID,value\nA,1\n")
    else:
        original = upload_module.inspect_data

        def pause(*args):
            result = original(*args)
            reached.set()
            assert resume.wait(5)
            return result

        monkeypatch.setattr(upload_module, "inspect_data", pause)

        def action():
            return transfers.finalize(key)

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(action)
        try:
            assert reached.wait(5)
            assert transfers.cancel(key)["state"] == "cancelled"
        finally:
            resume.set()
        with pytest.raises(ConflictError):
            future.result(timeout=5)
    assert not path.parent.exists()
    assert not transfers.assets.list()
    assert transfers.get(key)["state"] == "cancelled"


def test_finalize_wins_against_inflight_cancel(transfers, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    key, path = staged_transfer(transfers)
    reached, resume = Event(), Event()
    original = transfers.get
    first = True

    def pause(identifier):
        nonlocal first
        result = original(identifier)
        if first:
            first = False
            reached.set()
            assert resume.wait(5)
        return result

    monkeypatch.setattr(transfers, "get", pause)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(transfers.cancel, key)
        try:
            assert reached.wait(5)
            asset = transfers.finalize(key)
        finally:
            resume.set()
        with pytest.raises(ConflictError, match="registered"):
            future.result(timeout=5)
    assert transfers.assets.path(asset).read_bytes() == b"ID,value\nA,1\n"
    assert not path.parent.exists()
    with transfers.assets.store.connect() as db:
        assert not db.execute("SELECT upload_id FROM asset_upload_cleanup").fetchone()


def test_concurrent_cancellations_serialize_cleanup(transfers, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    key, path = staged_transfer(transfers)
    reached, second_started, resume = Event(), Event(), Event()
    original = transfers._cleanup_cancelled
    calls = 0

    def pause(row):
        nonlocal calls
        calls += 1
        if calls == 1:
            reached.set()
            assert resume.wait(5)
        original(row)

    monkeypatch.setattr(transfers, "_cleanup_cancelled", pause)

    def retry():
        second_started.set()
        return transfers.cancel(key)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(transfers.cancel, key)
        try:
            assert reached.wait(5)
            second = executor.submit(retry)
            assert second_started.wait(5)
            assert not second.done()
        finally:
            resume.set()
        assert first.result(timeout=5)["state"] == "cancelled"
        assert second.result(timeout=5)["state"] == "cancelled"
    assert not path.parent.exists()
    assert calls == 2
    assert len(transfers.chunks(key)) == 1


def test_legacy_enrollment_interruption_rolls_back_and_retries(transfers, monkeypatch):
    from pathlib import Path

    key, path = staged_transfer(transfers)
    with transfers.assets.store.connect() as db:
        db.execute("UPDATE asset_uploads SET state='cancelled' WHERE id=?", (str(key),))
        db.execute("DROP TABLE asset_upload_cleanup")
    original = Path.lstat

    def interrupt(self, *args, **kwargs):
        if self == path.parent:
            raise KeyboardInterrupt("controlled enrollment interruption")
        return original(self, *args, **kwargs)

    with monkeypatch.context() as fault:
        fault.setattr(Path, "lstat", interrupt)
        with pytest.raises(KeyboardInterrupt):
            reopen_transfers(transfers)
    with transfers.assets.store.connect() as db:
        assert not db.execute(
            "SELECT 1 FROM sqlite_master WHERE name='asset_upload_cleanup'"
        ).fetchone()
    assert path.read_bytes() == b"ID,value\nA,1\n"
    reopened = reopen_transfers(transfers)
    reopened.cancel(key)
    assert not path.parent.exists()
