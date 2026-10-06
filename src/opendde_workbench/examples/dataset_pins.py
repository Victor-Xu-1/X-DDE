"""Public dataset pins require reviewed input bytes and completed same-case stage lineage."""

import json

from ..assets import AssetStore
from ..datasets.bindings import resolve_source
from .catalogue import FILES


def validate_dataset_case(job, prepared, store):
    assets = AssetStore(store, store.path.parent / "assets")
    allowed = {FILES[key].sha256 for key in prepared.case.files}
    if any(
        item.source.sha256 not in allowed
        or assets.get(item.source.asset_id).sha256 != item.source.sha256
        for item in job.request.inputs
    ):
        raise ValueError("Every public dataset input must match the reviewed case source bytes.")
    with store.connect() as database:
        jobs = {
            row["job_id"]
            for row in database.execute("SELECT job_id,body FROM example_pins")
            if json.loads(row["body"])["case_id"] == prepared.case.id
        }
    if any(str(source.job_id) not in jobs for source in job.request.sources):
        raise ValueError(
            "Each dataset predecessor must be a fixed native stage of the same public case."
        )
    for source in job.request.sources:
        resolve_source(store, store.path.parent, source, full_hash=True)
    if not job.request.inputs and not job.request.sources:
        raise ValueError("A fixed dataset example needs source-backed scientific materials.")
