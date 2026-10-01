"""Validate source format, version and sequence contents before an isolated native task."""

from ..research.storage import ScientificStore
from .fasta import read_fasta


def sequence_bindings(task, assets):
    ref = task.sequences
    asset = assets.get(ref.asset_id)
    if (
        asset.kind != "sequences"
        or asset.suffix not in {".fa", ".fasta"}
        or asset.sha256 != ref.sha256
        or asset.size > 2 * 1024**2
    ):
        raise ValueError("Antibody numbering requires an exact bounded FASTA input version.")
    ScientificStore(assets.store, assets).validate_reference(ref)
    read_fasta(assets.path(asset).read_bytes())
    return {asset.id: asset}
