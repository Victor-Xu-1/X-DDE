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


@pytest.mark.parametrize("rich", [("C",), ("A",), ("A", "B", "C")])
def test_fold_msa_chain_values_keep_exact_fasta_provenance(tmp_path, rich):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    sequences = {"A": "EVQLVESGG", "B": "DIQMTQSPSS", "C": "MKVLQEPTCVSDYMSISTCEWK"}
    source = assets.save(
        "constructs.fasta",
        "sequences",
        "".join(f">{chain}\n{sequence}\n" for chain, sequence in sequences.items()).encode(),
    )
    chains = dict(sequences)
    alignments = {}
    for chain in rich:
        alignment = assets.save(chain + ".a3m", "msa", f">query\n{sequences[chain]}\n".encode())
        alignments[chain] = alignment
        chains[chain] = {
            "sequence": sequences[chain],
            "unpairedMsaPath": "asset:" + alignment.id,
        }
    request = HarnessTask(
        name="MSA source binding",
        tool="fold",
        allow_external=True,
        payload={
            "candidates": [
                {"candidate_id": "Fv", "chains": {c: chains[c] for c in ("A", "B")}}
            ],
            "options": {"target_chains": {"C": chains["C"]}},
        },
        scientific_inputs=[{"asset_id": source.id, "sha256": source.sha256}],
    )
    original = request.model_dump(mode="json")
    directory = tmp_path / "task"
    directory.mkdir()
    bindings = assets.snapshot(request, directory)
    assert source.id in bindings
    assert (directory / "assets" / (source.id + ".fasta")).read_bytes() == assets.path(
        source
    ).read_bytes()
    for alignment in alignments.values():
        assert alignment.id in bindings
        assert (directory / "assets" / (alignment.id + ".a3m")).read_bytes() == assets.path(
            alignment
        ).read_bytes()
    assert request.model_dump(mode="json") == original
    changed = request.model_copy(deep=True)
    chain = rich[0]
    owner = (
        changed.payload["options"]["target_chains"]
        if chain == "C"
        else changed.payload["candidates"][0]["chains"]
    )
    owner[chain]["sequence"] += "A"
    with pytest.raises(ValueError, match="differs from"):
        assets.validate_bindings(changed)
    assert request.model_dump(mode="json") == original


@pytest.mark.parametrize(
    "value", [None, 42, ["EVQLVESGG"], {"sequence": 42}, {"label": "EVQLVESGG"}]
)
def test_non_sequence_chain_values_cannot_claim_fasta_sources(tmp_path, value):
    assets = AssetStore(Store(tmp_path / "jobs.sqlite3"), tmp_path / "assets")
    source = assets.save("source.fasta", "sequences", b">chain\nEVQLVESGG\n")
    request = HarnessTask(
        name="Invalid source binding",
        tool="fold",
        allow_external=True,
        payload={"candidates": [{"chains": {"A": value}}], "options": {"target_chains": {}}},
        scientific_inputs=[{"asset_id": source.id, "sha256": source.sha256}],
    )
    with pytest.raises(ValueError, match="differs from"):
        assets.validate_bindings(request)
