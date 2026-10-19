"""Serve verified comparison evidence and its registered derived structural versions."""

import hashlib
import json

from ..artifacts import contained
from ..research.storage import ScientificStore
from .validation import validate_comparison

DERIVED_STRUCTURES = {"reference-selected.cif": "reference", "moving-aligned.cif": "moving"}


def comparison_output(store, assets, job_id, file):
    job = store.get(str(job_id))
    if not job or job.request.operation != "structure_compare":
        return None
    output = assets.root.parent / "jobs" / job.id / "output"
    manifest = contained(output, "result.json")
    if manifest.stat().st_size > 25 * 1024**2:
        raise ValueError("Comparison scientific report exceeds its bounded size.")
    result = validate_comparison(json.loads(manifest.read_bytes()), job.request, output)
    if file.name not in {"result.json", *DERIVED_STRUCTURES} or (
        file.resolve() != contained(output, file.name).resolve()
    ):
        raise ValueError(
            "Reuse the selected/aligned derivatives; original versions remain unchanged."
        )
    return result


def present_comparison(value, job, output, store, assets):
    result = validate_comparison(value, job.request, output)
    references = {}
    for version in ScientificStore(store, assets).list(source_job=job.id):
        if version.kind != "structure":
            continue
        asset = assets.get(version.reference.asset_id)
        role = DERIVED_STRUCTURES.get(asset.name)
        if role and version.reference.sha256 == result.artifact_sha256[asset.name]:
            if role in references:
                raise ValueError("Comparison has ambiguous registered structural versions.")
            if hashlib.sha256(assets.path(asset).read_bytes()).hexdigest() != asset.sha256:
                raise ValueError("Registered comparison coordinates changed after indexing.")
            references[role] = version.reference.model_dump(mode="json")
    return {**value, "derived_references": references}
