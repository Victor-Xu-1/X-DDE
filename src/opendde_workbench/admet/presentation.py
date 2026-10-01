"""Prediction views reuse original inputs; never create inferred molecule versions on a GET."""

from ..scientific_objects import MoleculeRef
from .manifest import METADATA
from .result import validate_admet


def present_admet(value, job, output, assets):
    result = validate_admet(value, job.request, output)
    value = result.model_dump(mode="json")
    source = job.request.source
    value["source_name"] = assets.get(source.asset_id).name
    value["endpoints"] = METADATA["endpoints"]
    value["upstream_commit"] = METADATA["upstream_commit"]
    for row in value["rows"]:
        if row["status"] == "predicted":
            ref = (
                job.request.molecule
                if job.request.molecule
                else MoleculeRef(
                    asset_id=source.asset_id, sha256=source.sha256, record=row["record"]
                )
            )
            row["reference"] = ref.model_dump(mode="json")
    return value
