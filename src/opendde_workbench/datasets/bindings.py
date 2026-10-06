"""Only declared asset versions and successful matching scientific results are reusable."""

import hashlib
from pathlib import Path

from ..artifacts import contained
from .contract import DatasetTask
from .result import DatasetResult, validate_result

FORMATS = {
    "data": ("library", None),
    "structure": ("structure", {".pdb", ".cif"}),
    "ligand": ("ligand", {".sdf", ".mol"}),
    "definition": ("config", {".json"}),
    "building_blocks": ("library", {".csv", ".tsv", ".csv.gz", ".tsv.gz"}),
    "counts": ("counts", None),
    "reads": ("reads", None),
}


def asset_bindings(request, assets):
    bound = {}
    for item in request.inputs:
        file = assets.get(item.source.asset_id)
        expected, suffixes = FORMATS[item.role]
        if (
            file.kind != expected
            or file.sha256 != item.source.sha256
            or (suffixes and file.suffix not in suffixes)
        ):
            raise ValueError("Choose a supported exact research file matching its input role.")
        assets.path(file)
        if item.source.version_id:
            from ..research.storage import ScientificStore

            ScientificStore(assets.store, assets).validate_reference(item.source)
        bound[file.id] = file
    for source in request.sources:
        _, _, result = resolve_source(assets.store, assets.root.parent, source)
        required = {
            "library": "compound_library",
            "index": "embedding_row_identities",
            "definition": "del_library_definition",
            "decoded": "decoded_umi_evidence",
            "counts": "compound_count_matrix",
            "analysis": "del_comparison_evidence",
            "model": "del_enrichment_research_model",
        }.get(source.role)
        if required and not any(item.role == required for item in result.artifacts):
            raise ValueError(
                "Choose the completed scientific stage required by this analysis path."
            )
    return bound


def resolve_source(store, state: Path, reference, *, full_hash=False):
    job = store.get(str(reference.job_id))
    if job is None or job.status != "succeeded" or not isinstance(job.request, DatasetTask):
        raise ValueError("Choose a successfully completed scientific data result.")
    root = state / "jobs" / job.id / "output"
    file = contained(root, "result.json")
    if file.stat().st_size > 4 * 1024**2:
        raise ValueError("Scientific data result summary exceeds its size budget.")
    content = file.read_bytes()
    if hashlib.sha256(content).hexdigest() != reference.report_sha256:
        raise ValueError("Chosen data result version differs from its registered summary.")
    result = validate_result(
        DatasetResult.model_validate_json(content), job.request, root, full_hash=full_hash
    )
    if result.data_kind != reference.role:
        raise ValueError("Selected source result has a different scientific role.")
    return job, root, result
