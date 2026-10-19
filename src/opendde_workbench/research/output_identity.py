"""Stable registration key shared by native output indexing and portable evidence."""


def artifact_key(job_id, asset_id, kind, record):
    return f"artifact:{job_id}:{asset_id}:{kind}:{record}"
