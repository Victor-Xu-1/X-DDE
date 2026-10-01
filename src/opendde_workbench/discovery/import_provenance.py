"""Verify selected evidence identity before public archive material retrieval."""

import json

from ..research.storage import ScientificStore


def evidence_binding(request, assets):
    ref = request.evidence
    if ref is None:
        return {}
    if ref.version_id is None or ref.record or ref.conformer:
        raise ValueError("Choose one saved analysis version for archive provenance.")
    scientific = ScientificStore(assets.store, assets)
    scientific.validate_reference(ref)
    version = scientific.get(ref.version_id)
    if version.kind != "analysis":
        raise ValueError("Source evidence must be an analysis report.")
    origin = version
    for _ in range(16):
        if origin.source_job:
            break
        if not origin.parent_id:
            raise ValueError("This report has no verified public-retrieval origin.")
        origin = scientific.get(origin.parent_id)
        if origin.kind != "analysis" or origin.reference.sha256 != ref.sha256:
            raise ValueError("Source evidence changed while following provenance.")
    else:
        raise ValueError("Source provenance exceeds its bounded ancestry depth.")
    job = assets.store.get(str(origin.source_job))
    if not job or job.request.operation != "target_research" or job.request.entity != "target":
        raise ValueError("Choose a retrieved target-evidence report.")
    asset = assets.get(ref.asset_id)
    if asset.kind != "config" or asset.sha256 != ref.sha256 or asset.size > 25 * 1024**2:
        raise ValueError("Selected evidence file type/digest is invalid.")
    data = json.loads(assets.path(asset).read_text())
    if data.get("operation") != "target_research" or data.get("request") != job.request.model_dump(
        mode="json"
    ):
        raise ValueError("Selected evidence does not match its original source task.")
    if request.source == "pdb":
        structures = [
            s["id"].upper() for m in data.get("materials", []) for s in m.get("structures", [])
        ]
        if request.identifier not in structures:
            raise ValueError("Selected PDB record was not included in this evidence snapshot.")
    else:
        rows = (data.get("activities") or {}).get("rows", [])
        if not any(
            row.get("activity_id") == request.activity_id
            and row.get("molecule_chembl_id") == request.identifier
            for row in rows
        ):
            raise ValueError(
                "Selected molecule/activity pair does not match measured source evidence."
            )
    from .result import validate_result

    source_output = assets.root.parent / "jobs" / job.id / "output"
    validate_result(data, job.request, source_output)
    return {str(asset.id): asset}
