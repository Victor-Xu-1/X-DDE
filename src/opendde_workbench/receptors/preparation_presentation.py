"""Serve verified prepared material with its exact scientific reference."""

import hashlib

from ..research.storage import ScientificStore
from .preparation_result import validate_preparation


def saved_preparation_reference(digest, job_id, store, assets):
    versions = ScientificStore(store, assets).list(source_job=job_id)
    matching = [v for v in versions if v.kind == "structure" and v.reference.sha256 == digest]
    if len(matching) == 1:
        ref = matching[0].reference
        asset = assets.get(ref.asset_id)
        if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != digest:
            raise ValueError("Saved prepared structural bytes changed.")
        return ref
    return None


def present_preparation(value, job, output, store, assets):
    result = validate_preparation(value, job.request, output)
    ref = saved_preparation_reference(result.sha256, job.id, store, assets)
    if ref is not None:
        value["reference"] = ref.model_dump(mode="json")
    return value
