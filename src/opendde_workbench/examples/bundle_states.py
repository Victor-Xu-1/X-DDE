"""Retained chemical collections must reproduce their actual native output records."""

from ..research.state_sets import StateSets


def validate_states(store, assets, root, rows):
    states = StateSets(store, assets)
    for row in rows:
        value = states.get(row["id"])
        job = store.get(str(value.source_job))
        if not job or job.status != "succeeded" or job.request.operation != "molecular_states":
            raise ValueError("A portable state collection lacks its successful native source.")
        if row["source_job"] != str(value.source_job):
            raise ValueError("The portable state source differs from its immutable record.")
        # The existing state authority checks all native files, atom mappings, record
        # identities, options and saved versions. This indexes evidence, not inference.
        if states.ingest(job, root / "jobs" / job.id / "output") != value:
            raise ValueError("The portable state collection differs from its native evidence.")
