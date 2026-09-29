import hashlib
from uuid import uuid4

import pytest

from opendde_workbench.managed_files import publish_shared


def test_shared_input_publication_is_atomic_and_rejects_symlink_targets(tmp_path):
    source = tmp_path / "input.cif"
    source.write_text("controlled input bytes")
    shared = tmp_path / "shared"
    identifier = str(uuid4())
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert (
        publish_shared(source, identifier, shared, "/compute", digest)
        == f"/compute/{identifier}/input.cif"
    )
    assert (shared / identifier / "input.cif").read_bytes() == source.read_bytes()
    before = (shared / identifier / "input.cif").read_bytes()
    with pytest.raises(ValueError, match="integrity"):
        publish_shared(source, identifier, shared, "/compute", "0" * 64)
    assert (shared / identifier / "input.cif").read_bytes() == before
    outside = tmp_path / "outside"
    outside.mkdir()
    (shared / "bad").symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="symbolic"):
        publish_shared(source, "bad", shared, "/compute")
    assert list(outside.iterdir()) == []
