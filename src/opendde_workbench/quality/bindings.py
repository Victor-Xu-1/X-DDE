"""Validate format, source digest and immutable scientific versions at the platform boundary."""

from ..research.storage import ScientificStore
from .contract import references


def quality_bindings(task, assets):
    values = {}
    for role, ref in references(task):
        asset = assets.get(ref.asset_id)
        expected = ("structure", ".pdb") if role == "protein" else ("ligand", ".sdf")
        if (
            (asset.kind, asset.suffix) != expected
            or asset.sha256 != ref.sha256
            or asset.size > 25 * 1024**2
        ):
            raise ValueError("Pose quality requires exact SDF records and a prepared PDB receptor.")
        ScientificStore(assets.store, assets).validate_reference(ref)
        assets.path(asset)
        values[asset.id] = asset
    return values
