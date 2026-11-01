"""Match native file roles to exact managed bytes, retaining original record identities."""

from pathlib import Path

from .property_models import verified_property_model


def validate_bindings(request, assets):
    if request.operation == "boltzgen_design" and request.payload.continuation:
        from .binder_checkpoints import validate_continuation

        validate_continuation(request, assets.root.parent, assets.store)
    result = {}
    for item in request.inputs:
        ref = item.source
        asset = assets.get(ref.asset_id)
        expected = (
            "msa"
            if item.role == "msa"
            else "structure"
            if item.role in {"structure", "scaffold", "partner_a", "partner_b"}
            else "ligand"
        )
        suffixes = (
            {".a3m", ".csv"}
            if expected == "msa"
            else {".pdb", ".cif"}
            if expected == "structure"
            else {".sdf", ".mol"}
        )
        if item.role == "library":
            suffixes = {".sdf"}
        if asset.kind != expected or asset.suffix not in suffixes or asset.sha256 != ref.sha256:
            raise ValueError("Choose an exact supported file matching the selected input role.")
        assets.path(asset)
        result[asset.id] = asset
    if request.operation == "boltz_predict":
        from .boltz_inputs import checked_msa

        for component in request.payload.components:
            if component.msa:
                checked_msa(component.msa, component.value, assets)
    if request.operation == "chemprop_predict":
        trained_model(assets.root.parent, assets.store, request.payload)
    return result


def trained_model(state: Path, store, payload):
    model = verified_property_model(state, store.get(str(payload.model_job)))
    if (payload.activity_property, payload.activity_unit) != (
        model.summary.activity_property,
        model.summary.activity_unit,
    ):
        raise ValueError("Prediction target and units must match the chosen trained model.")
    if model.summary.sha256 != payload.model_sha256:
        raise ValueError("Selected property model version differs from its training result.")
    return model.path
