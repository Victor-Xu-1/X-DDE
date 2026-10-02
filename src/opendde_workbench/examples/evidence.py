"""Byte-level evidence shared by task and compound public case references."""

import hashlib
import json

from ..artifacts import contained, list_artifacts
from .contracts import JobEvidence


def capture_job(store, state, job_id):
    job = store.get(str(job_id))
    environment = store.environment(str(job_id))
    if job is None or job.status != "succeeded" or environment is None:
        raise ValueError("Public case evidence requires a successful native task and environment.")
    output = state / "jobs" / str(job_id) / "output"
    if job.request.operation == "harness":
        file = contained(output, "result.json")
        if file.stat().st_size > 2 * 1024**2:
            raise ValueError("The fixed native report exceeds its bounded read limit.")
        result = json.loads(file.read_text())["result"]
        if isinstance(result, dict) and result.get("available") is False:
            raise ValueError("An unavailable service response is not a computed example.")
    digests = {}
    for artifact in list_artifacts(output):
        with contained(output, artifact.name).open("rb") as stream:
            digests[artifact.name] = hashlib.file_digest(stream, "sha256").hexdigest()
    if not digests:
        raise ValueError("The native example has no retained output artifacts.")
    return JobEvidence(
        job_id=job_id,
        request_sha256=hashlib.sha256(job.request.model_dump_json().encode()).hexdigest(),
        environment_sha256=environment.snapshot_sha256,
        artifact_sha256=digests,
    )


def verify_job(store, state, evidence):
    current = capture_job(store, state, evidence.job_id)
    if current != evidence:
        raise ValueError("The fixed example's task, environment or output bytes changed.")
