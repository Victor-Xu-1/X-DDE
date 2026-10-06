"""A restored scientific input is reused by verified content, not by transfer history."""

import hashlib
from types import SimpleNamespace

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.dataset_inputs import register_dataset_input
from opendde_workbench.store import Store


def test_public_input_restore_without_upload_receipts_is_idempotent(tmp_path, monkeypatch):
    from opendde_workbench.examples import dataset_inputs

    raw = b"member,SMILES\nprotocol,c1ccccc1\n"
    spec = SimpleNamespace(name="protocol.csv", sha256=hashlib.sha256(raw).hexdigest())
    monkeypatch.setattr(dataset_inputs, "verified_file", lambda cache, spec: raw)
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    first = register_dataset_input(assets, tmp_path / "cache", spec, kind="library")
    with assets.store.connect() as database:
        database.execute("DELETE FROM asset_upload_chunks")
        database.execute("DELETE FROM asset_uploads")
    second = register_dataset_input(assets, tmp_path / "cache", spec, kind="library")
    assert first.id == second.id and assets.path(first).read_bytes() == raw
    assert len(assets.list()) == 1
    assets.path(first).write_bytes(raw[:-1] + b"!")
    with pytest.raises(ValueError, match="input file changed"):
        register_dataset_input(assets, tmp_path / "cache", spec, kind="library")
