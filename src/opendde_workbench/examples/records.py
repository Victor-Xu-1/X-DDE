"""Immutable case pointers; original regions/plans/runs retain their existing owners."""

import hashlib
import json

from ..store import ConflictError, now
from .catalogue import MODULES
from .contracts import ExampleRecordPin
from .evidence import capture_job, verify_job
from .record_sources import record_source, validate_record_source

RECORD_MODULES = {"regions", "workflows", "pose_exploration", "campaign", "experimental.evidence"}


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


class ExampleRecords:
    def __init__(self, store, assets, settings, *, modules=MODULES):
        self.store, self.assets, self.settings = store, assets, settings
        self.modules = modules
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS example_record_pins ("
                "capability_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, "
                "PRIMARY KEY(capability_id,revision))"
            )

    def source(self, record):
        return record_source(
            record.capability_id,
            record.record_id,
            record.run_id,
            self.store,
            self.assets,
            self.settings,
        )

    def get(self, capability, *, verify=False):
        if capability not in RECORD_MODULES:
            return None
        with self.store.connect() as db:
            row = db.execute(
                "SELECT body FROM example_record_pins WHERE capability_id=? AND revision=?",
                (capability, self.modules[capability].revision),
            ).fetchone()
        record = ExampleRecordPin.model_validate_json(row["body"]) if row else None
        if record and record.case_id != self.modules[capability].case_id:
            raise ValueError("The pinned scientific record belongs to a different study.")
        if record and verify:
            source, jobs = self.source(record)
            if digest(source) != record.record_sha256 or set(map(str, jobs)) != {
                str(evidence.job_id) for evidence in record.evidence
            }:
                raise ValueError("The fixed case's scientific record changed.")
            for evidence in record.evidence:
                verify_job(self.store, self.settings.state_dir, evidence)
        return record

    def prepared(self, capability):
        record = self.get(capability, verify=True)
        if record is None:
            return None
        source, _ = self.source(record)
        return {**source, "pin": record.model_dump(mode="json")}

    def pin(self, capability, record_id, run_id, prepared):
        if capability not in RECORD_MODULES:
            raise ValueError("This module uses a native task result.")
        module = self.modules[capability]
        if prepared.module != module:
            raise ValueError("The prepared record belongs to a different reviewed study revision.")
        source, jobs = record_source(
            capability, record_id, run_id, self.store, self.assets, self.settings
        )
        validate_record_source(capability, source, prepared, self.store, job_ids=jobs)
        record = ExampleRecordPin(
            capability_id=capability,
            case_id=module.case_id,
            revision=module.revision,
            record_id=record_id,
            record_sha256=digest(source),
            run_id=run_id,
            evidence=tuple(
                capture_job(self.store, self.settings.state_dir, job) for job in sorted(set(jobs))
            ),
            computed_result_available=capability != "campaign",
            created_at=now(),
        )
        with self.store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT body FROM example_record_pins WHERE capability_id=? AND revision=?",
                (capability, module.revision),
            ).fetchone()
            if old:
                previous = ExampleRecordPin.model_validate_json(old["body"])
                if previous.model_copy(update={"created_at": record.created_at}) != record:
                    raise ConflictError(
                        "The fixed case reference is immutable; use a new revision."
                    )
                return previous
            db.execute(
                "INSERT INTO example_record_pins VALUES(?,?,?)",
                (capability, module.revision, record.model_dump_json()),
            )
        return record
