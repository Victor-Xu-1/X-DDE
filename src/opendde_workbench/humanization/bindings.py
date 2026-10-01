"""Exact original FASTA versions enter the independent managed environment."""

from ..antibodies.fasta import read_fasta
from ..research.storage import ScientificStore
from .manifest import MAX_RECORDS


def sequence_bindings(task, assets):
    ref = task.sequences
    asset = assets.get(ref.asset_id)
    if (
        asset.kind != "sequences"
        or asset.suffix not in {".fa", ".fasta"}
        or asset.sha256 != ref.sha256
        or asset.size > 2 * 1024**2
    ):
        raise ValueError("Choose an exact FASTA input no larger than 2 MiB.")
    ScientificStore(assets.store, assets).validate_reference(ref)
    if len(read_fasta(assets.path(asset).read_bytes())) > MAX_RECORDS:
        raise ValueError("Choose at most20 variable-region records for each task.")
    return {asset.id: asset}
