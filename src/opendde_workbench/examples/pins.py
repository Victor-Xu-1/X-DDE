"""Immutable pointers to successful native jobs in the existing platform database."""

from ..store import ConflictError, now
from .catalogue import MODULES
from .contracts import ExamplePin, JobEvidence
from .evidence import capture_job, verify_job
from .pin_validation import validate_case_job


class ExamplePins:
    def __init__(self, store, state):
        self.store, self.state = store, state
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS example_pins ("
                "capability_id TEXT NOT NULL, revision INTEGER NOT NULL, "
                "job_id TEXT NOT NULL, body TEXT NOT NULL, "
                "PRIMARY KEY(capability_id,revision))"
            )

    def get(self, capability_id, *, verify=False):
        revision = MODULES[capability_id].revision
        with self.store.connect() as db:
            row = db.execute(
                "SELECT body FROM example_pins WHERE capability_id=? AND revision=?",
                (capability_id, revision),
            ).fetchone()
        record = ExamplePin.model_validate_json(row["body"]) if row else None
        if record and verify:
            verify_job(
                self.store,
                self.state,
                JobEvidence(
                    job_id=record.job_id,
                    request_sha256=record.request_sha256,
                    environment_sha256=record.environment_sha256,
                    artifact_sha256=record.artifact_sha256,
                ),
            )
        return record

    def pin(self, capability_id, job_id, prepared):
        module = MODULES[capability_id]
        job = self.store.get(str(job_id))
        if job is None or job.status != "succeeded":
            raise ValueError("Only successful native tasks can become fixed computed examples.")
        validate_case_job(capability_id, job, prepared, self.store)
        evidence = capture_job(self.store, self.state, job_id)
        digests = evidence.artifact_sha256
        record = ExamplePin(
            capability_id=capability_id,
            case_id=module.case_id,
            revision=module.revision,
            job_id=job_id,
            request_sha256=evidence.request_sha256,
            environment_sha256=evidence.environment_sha256,
            artifact_sha256=digests,
            created_at=now(),
        )
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT body FROM example_pins WHERE capability_id=? AND revision=?",
                (capability_id, module.revision),
            ).fetchone()
            if old:
                existing = ExamplePin.model_validate_json(old["body"])
                if (
                    existing.job_id != record.job_id
                    or existing.artifact_sha256 != digests
                    or existing.request_sha256 != record.request_sha256
                    or existing.environment_sha256 != record.environment_sha256
                ):
                    raise ConflictError("The fixed example is immutable; publish a new revision.")
                return existing
            db.execute(
                "INSERT INTO example_pins VALUES(?,?,?,?)",
                (capability_id, module.revision, str(job_id), record.model_dump_json()),
            )
        return record
