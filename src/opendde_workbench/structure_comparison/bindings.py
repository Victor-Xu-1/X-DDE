"""Resolve both immutable sources through the existing scientific asset authority."""


def comparison_bindings(request, assets):
    from ..research.storage import ScientificStore

    result = {}
    for ref in (request.reference, request.moving):
        asset = assets.get(ref.asset_id)
        if (
            asset.kind != "structure"
            or asset.suffix not in {".pdb", ".cif"}
            or (asset.sha256 != ref.sha256)
        ):
            raise ValueError("Comparison requires both exact PDB/mmCIF structural versions.")
        if ref.version_id:
            ScientificStore(assets.store, assets).validate_reference(ref)
        assets.path(asset)
        result[asset.id] = asset
    return result
