"""Bounded immutable output metadata; no scientific execution."""

from uuid import uuid4

import pytest

from opendde_workbench import artifacts


def test_metadata_refuses_an_output_changed_during_hashing(tmp_path, monkeypatch):
    path = tmp_path / "STAT6.sdf"
    path.write_bytes(b"source transport fixture")
    original = artifacts.hashlib.sha256

    def changed(content):
        result = original(content)
        path.write_bytes(b"changed transport fixture")
        return result

    monkeypatch.setattr(artifacts.hashlib, "sha256", changed)
    with pytest.raises(artifacts.SourceFileChanged):
        artifacts.artifact_metadata(tmp_path, path.name, uuid4())


def test_metadata_does_not_hash_an_oversized_reusable_input(tmp_path, monkeypatch):
    path = tmp_path / "large.sdf"
    with path.open("wb") as stream:
        stream.truncate(25 * 1024**2 + 1)
    monkeypatch.setattr(
        artifacts.hashlib, "sha256", lambda *_: pytest.fail("oversized result was read")
    )
    with pytest.raises(ValueError, match="25 MiB"):
        artifacts.artifact_metadata(tmp_path, path.name, uuid4())
