"""Only actual indexed candidate FASTA versions are offered for downstream reuse."""

import hashlib

from ..research.storage import ScientificStore
from .result import validate_humanization


def present_humanization(value, job, output, store, assets):
    result = validate_humanization(value, job.request, output)
    versions = ScientificStore(store, assets).list(limit=200, source_job=job.id)
    for row, evaluated in zip(value["rows"], result.rows, strict=True):
        if not evaluated.artifact:
            continue
        matched = [
            version
            for version in versions
            if version.kind == "sequence" and version.reference.sha256 == evaluated.artifact_sha256
        ]
        if len(matched) == 1:
            ref = matched[0].reference
            asset = assets.get(ref.asset_id)
            if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != ref.sha256:
                raise ValueError("Saved candidate FASTA bytes changed.")
            row["reference"] = ref.model_dump(mode="json")
    return value
