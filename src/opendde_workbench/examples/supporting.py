"""Follow-up results must consume computed case outputs, never unrelated personal work."""

import json

from ..requests import input_identifiers
from .evidence import capture_job


def supporting_evidence(store, state, primary, prepared, identifiers):
    identifiers = tuple(map(str, identifiers))
    if len(set(identifiers)) != len(identifiers) or primary.id in identifiers:
        raise ValueError("Supporting task identities must be unique and distinct from the primary.")
    known_jobs = {primary.id}
    allowed_inputs = {str(value.reference.asset_id) for value in prepared.objects.values()}
    allowed_inputs.update(input_identifiers(primary.request))
    evidence = []
    for identifier in identifiers:
        job = store.get(identifier)
        if job is None or job.status != "succeeded":
            raise ValueError("Only successful native follow-up results can support a fixed case.")
        with store.connect() as db:
            descendants = {
                row["asset_id"]
                for row in db.execute("SELECT asset_id,body FROM scientific_objects")
                if json.loads(row["body"]).get("source_job") in known_jobs
            }
        inputs = input_identifiers(job.request)
        if not inputs or not inputs & descendants or not inputs <= allowed_inputs | descendants:
            raise ValueError(
                "Supporting results must consume computed case outputs in dependency order; "
                "every other input must retain the same reviewed case lineage."
            )
        evidence.append(capture_job(store, state, job.id))
        allowed_inputs.update(descendants)
        known_jobs.add(job.id)
    return tuple(evidence)
