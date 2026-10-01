"""Whole-file digest and exact single-record provenance are validated before dispatch."""

from ..research.storage import ScientificStore
from .manifest import MAX_INPUT_BYTES


def admet_bindings(task, assets):
    ref = task.source
    asset = assets.get(ref.asset_id)
    if (
        asset.kind != "ligand"
        or asset.suffix != ".sdf"
        or asset.sha256 != ref.sha256
        or asset.size > MAX_INPUT_BYTES
    ):
        raise ValueError("ADMET prediction requires exact SDF input bytes no larger than 8 MiB.")
    assets.path(asset)
    if task.molecule:
        ScientificStore(assets.store, assets).validate_reference(task.molecule)
    return {asset.id: asset}
