"""Attach exact selected molecular output versions without synthesizing missing records."""

import hashlib

from ..research.storage import ScientificStore
from .screen_result import validate_screen


def present_screen(value, job, output, store, assets):
    result = validate_screen(value, job.request, output)
    versions = ScientificStore(store, assets).list(limit=200, source_job=job.id)
    saved = [v for v in versions if v.kind == "molecule" and v.reference.sha256 == result.sha256]
    if saved:
        asset = assets.get(saved[0].reference.asset_id)
        if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != result.sha256:
            raise ValueError("Saved library output bytes changed.")
    for row in value["rows"]:
        if row["selected"]:
            matching = [v for v in saved if v.reference.record == row["output_record"]]
            if len(matching) == 1:
                row["reference"] = matching[0].reference.model_dump(mode="json")
    return value
