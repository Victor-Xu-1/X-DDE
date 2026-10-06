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
