"""Match native file roles to exact managed bytes, retaining original record identities."""

import hashlib
from pathlib import Path

from ..artifacts import contained


def validate_bindings(request, assets):
    result = {}
    for item in request.inputs:
        ref = item.source
        asset = assets.get(ref.asset_id)
        expected = "structure" if item.role in {"structure", "scaffold"} else "ligand"
        suffixes = {".pdb", ".cif"} if expected == "structure" else {".sdf", ".mol"}
        if item.role == "library":
            suffixes = {".sdf"}
        if asset.kind != expected or asset.suffix not in suffixes or asset.sha256 != ref.sha256:
            raise ValueError("Choose an exact supported file matching the selected input role.")
        assets.path(asset)
        result[asset.id] = asset
    if request.operation == "chemprop_predict":
        trained_model(assets.root.parent, assets.store, request.payload)
    return result


def trained_model(state: Path, store, payload):
    job = store.get(str(payload.model_job))
    if job is None or job.status != "succeeded" or job.request.operation != "chemprop_train":
        raise ValueError("Choose a successfully trained X-DDE property model.")
    if (payload.activity_property, payload.activity_unit) != (
        job.request.payload.activity_property,
        job.request.payload.activity_unit,
    ):
        raise ValueError("Prediction target and units must match the chosen trained model.")
    output = state / "jobs" / job.id / "output"
    report = contained(output, "result.json")
    import json

    from .result import validate_result

    if report.stat().st_size > 4 * 1024**2:
        raise ValueError("Property model report exceeds its bounded size.")
    result = validate_result(json.loads(report.read_text()), job.request, output)
    name = result.model_artifact
    if not name or result.artifact_sha256.get(name) != payload.model_sha256:
        raise ValueError("Selected property model version differs from its training result.")
    file = contained(output, name)
    with file.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != payload.model_sha256:
        raise ValueError("Trained property-model bytes changed.")
    return file
