"""Serve verified prepared material with its exact scientific reference."""

import hashlib

from ..research.storage import ScientificStore
from .preparation_result import validate_preparation


def present_preparation(value, job, output, store, assets):
    result = validate_preparation(value, job.request, output)
    versions = ScientificStore(store, assets).list(source_job=job.id)
    matching = [
        v for v in versions if v.kind == "structure" and v.reference.sha256 == result.sha256
    ]
    if len(matching) == 1:
        ref = matching[0].reference
        asset = assets.get(ref.asset_id)
        if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != result.sha256:
            raise ValueError("Saved prepared structural bytes changed.")
        value["reference"] = ref.model_dump(mode="json")
    return value
