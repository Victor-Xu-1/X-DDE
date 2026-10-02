"""Scientific source versions match actual native sequence inputs."""

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.harness_contract import HarnessTask
from opendde_workbench.store import Store


def test_multichain_fasta_provenance_is_snapshotted_and_rejects_changed_sequences(tmp_path):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    source = assets.save("antibody.fasta", "sequences", b">heavy\nEVQLVESGG\n>light\nDIQMTQSPSS\n")
    request = HarnessTask(
        name="source binding",
        tool="esm",
        payload={"sequences": ["EVQLVESGG", "DIQMTQSPSS"]},
        scientific_inputs=[{"asset_id": source.id, "sha256": source.sha256}],
    )
    directory = tmp_path / "task"
    directory.mkdir()
    bindings = assets.snapshot(request, directory)
    assert source.id in bindings
    assert (directory / "assets" / (source.id + ".fasta")).read_bytes() == assets.path(
        source
    ).read_bytes()
    changed = request.model_copy(update={"payload": {"sequences": ["EVQLVESGA", "DIQMTQSPSS"]}})
    with pytest.raises(ValueError, match="differs from"):
        assets.validate_bindings(changed)


def test_unrelated_sequence_cannot_be_attached_to_structural_analysis(tmp_path):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    source = assets.save("sequence.fasta", "sequences", b">public\nEVQLVESGG\n")
    request = HarnessTask(
        name="incorrect lineage",
        tool="structure",
        payload={},
        scientific_inputs=[{"asset_id": source.id, "sha256": source.sha256}],
    )
    with pytest.raises(ValueError, match="differs from"):
        assets.validate_bindings(request)
