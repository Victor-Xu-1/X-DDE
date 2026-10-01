"""Whole-library file identity and exact query version checks at the platform boundary."""

from ..research.storage import ScientificStore


def screen_bindings(task, assets):
    bindings = {}
    for ref in (task.library, task.query):
        if ref is None:
            continue
        asset = assets.get(ref.asset_id)
        if asset.kind != "ligand" or asset.suffix != ".sdf" or asset.sha256 != ref.sha256:
            raise ValueError("Library selection requires exact SDF library/query input bytes.")
        assets.path(asset)
        if ref is task.query:
            ScientificStore(assets.store, assets).validate_reference(ref)
        bindings[asset.id] = asset
    return bindings
