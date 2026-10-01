"""Validate public reports and attach exact, unchanged scientific asset references."""

import hashlib

from ..research.storage import ScientificStore
from .import_runner import validate_import_result
from .result import validate_result


def present_result(value, job, output, store, assets):
    if job.request.operation == "reference_import":
        validate_import_result(value, job.request, output)
    else:
        validate_result(value, job.request, output)
    versions = ScientificStore(store, assets).list(source_job=job.id)

    def matching_reference(kind, sha):
        matching = [v for v in versions if v.kind == kind and v.reference.sha256 == sha]
        if len(matching) != 1:
            return None
        ref = matching[0].reference
        asset = assets.get(ref.asset_id)
        if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != sha:
            raise ValueError("Saved research material bytes changed.")
        return ref.model_dump(mode="json")

    if job.request.operation == "reference_import":
        value["reference"] = matching_reference(value["kind"], value["sha256"])
    else:
        analyses = [v for v in versions if v.kind == "analysis"]
        if len(analyses) == 1:
            value["analysis_reference"] = matching_reference(
                "analysis", analyses[0].reference.sha256
            )
        for material in value["materials"]:
            material["reference"] = matching_reference("sequence", material["sha256"])
    return value
