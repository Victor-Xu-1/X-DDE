"""Immutable pointers to successful native jobs in the existing platform database."""

import hashlib

from ..artifacts import contained, list_artifacts
from ..store import ConflictError, now
from .catalogue import MODULES
from .contracts import ExamplePin
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
            job = self.store.get(str(record.job_id))
            environment = self.store.environment(str(record.job_id))
            if (
                job is None
                or job.status != "succeeded"
                or environment is None
                or hashlib.sha256(job.request.model_dump_json().encode()).hexdigest()
                != record.request_sha256
                or environment.snapshot_sha256 != record.environment_sha256
            ):
                raise ValueError("The fixed example's task or environment record changed.")
            output = self.state / "jobs" / str(record.job_id) / "output"
            if {item.name for item in list_artifacts(output)} != set(record.artifact_sha256):
                raise ValueError("The fixed example's artifact inventory changed.")
            for name, digest in record.artifact_sha256.items():
                with contained(output, name).open("rb") as stream:
                    if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                        raise ValueError("The fixed example's output bytes changed.")
        return record

    def pin(self, capability_id, job_id, prepared):
        module = MODULES[capability_id]
        job = self.store.get(str(job_id))
        if job is None or job.status != "succeeded":
            raise ValueError("Only successful native tasks can become fixed computed examples.")
        validate_case_job(capability_id, job, prepared, self.store)
        if job.request.operation == "harness":
            import json

            result_file = contained(self.state / "jobs" / str(job_id) / "output", "result.json")
            if result_file.stat().st_size > 2 * 1024**2:
                raise ValueError("The fixed native report exceeds its bounded read limit.")
            result = json.loads(result_file.read_text())["result"]
            if isinstance(result, dict) and result.get("available") is False:
                raise ValueError("An unavailable service response is not a computed example.")
        environment = self.store.environment(str(job_id))
        if environment is None:
            raise ValueError("The example requires the actual bound execution environment.")
        output = self.state / "jobs" / str(job_id) / "output"
        digests = {}
        for artifact in list_artifacts(output):
            path = contained(output, artifact.name)
            with path.open("rb") as stream:
                digests[artifact.name] = hashlib.file_digest(stream, "sha256").hexdigest()
        if not digests:
            raise ValueError("The native example has no retained output artifacts.")
        record = ExamplePin(
            capability_id=capability_id,
            case_id=module.case_id,
            revision=module.revision,
            job_id=job_id,
            request_sha256=hashlib.sha256(job.request.model_dump_json().encode()).hexdigest(),
            environment_sha256=environment.snapshot_sha256,
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
