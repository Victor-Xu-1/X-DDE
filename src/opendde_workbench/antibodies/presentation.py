"""Validated domain evidence is joined to actual saved sequence versions, never fabricated."""

import hashlib

from ..research.storage import ScientificStore
from .result import validate_numbering


def present_numbering(value, job, output, store, assets):
    result = validate_numbering(value, job.request, output)
    versions = ScientificStore(store, assets).list(limit=200, source_job=job.id)
    for row, domain in zip(value["domains"], result.domains, strict=True):
        if not domain.available:
            continue
        matched = [
            version
            for version in versions
            if version.kind == "sequence" and version.reference.sha256 == domain.sha256
        ]
        if len(matched) == 1:
            ref = matched[0].reference
            asset = assets.get(ref.asset_id)
            if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != domain.sha256:
                raise ValueError("Saved antibody domain sequence bytes changed.")
            row["reference"] = ref.model_dump(mode="json")
    return value
