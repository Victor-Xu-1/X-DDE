"""Fixed examples are a module library, not the user's personal task history."""

import json

from ..requests import TASK_ADAPTER
from ..store import now
from .bundle_jobs import TERMINAL_HISTORY
from .bundle_projection import references
from .catalogue import MODULES
from .stat6.catalogue import MODULES as STUDY_MODULES


class ExampleLibrary:
    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS example_library_tasks "
                "(job_id TEXT PRIMARY KEY, origin TEXT NOT NULL, created_at TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS example_library_projects (project_id TEXT PRIMARY KEY)"
            )

    def classify(self, identifiers, origin="fixed_example"):
        if origin not in {"fixed_example", "setup_validation"}:
            raise ValueError("Unknown example task origin.")
        with self.store.connect() as db:
            for identifier in identifiers:
                row = db.execute(
                    "SELECT request FROM jobs WHERE id=?", (str(identifier),)
                ).fetchone()
                if row is None:
                    raise ValueError("Cannot classify an unknown example record.")
                request = TASK_ADAPTER.validate_json(row["request"])
                # Even an ignored INSERT requires SQLite's writer lock. Keep unchanged
                # classification read-only, but retain conflict handling for concurrent inserts.
                if not db.execute(
                    "SELECT 1 FROM example_library_tasks WHERE job_id=?", (str(identifier),)
                ).fetchone():
                    db.execute(
                        "INSERT OR IGNORE INTO example_library_tasks VALUES(?,?,?)",
                        (str(identifier), origin, now()),
                    )
                if (
                    request.project_id
                    and not db.execute(
                        "SELECT 1 FROM example_library_projects WHERE project_id=?",
                        (str(request.project_id),),
                    ).fetchone()
                ):
                    db.execute(
                        "INSERT OR IGNORE INTO example_library_projects VALUES(?)",
                        (str(request.project_id),),
                    )

    def synchronize(self):
        # Follow only current immutable pin evidence and its explicitly referenced input versions.
        active = {
            (module.capability_id, module.revision): module
            for profile in (MODULES, STUDY_MODULES)
            for module in profile.values()
        }
        identifiers = set()
        with self.store.connect() as db:
            tables = {
                row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            for table in ("example_pins", "example_record_pins"):
                if table not in tables:
                    continue
                for row in db.execute("SELECT capability_id,revision,body FROM " + table):
                    module = active.get((row["capability_id"], row["revision"]))
                    if module is None:
                        continue
                    body = json.loads(row["body"])
                    if body.get("case_id") != module.case_id:
                        raise ValueError("The fixed task belongs to a different reviewed study.")
                    if table == "example_pins":
                        identifiers.add(body["job_id"])
                    else:
                        identifiers.update(entry["job_id"] for entry in body["evidence"])
                    identifiers.update(
                        entry["job_id"] for entry in body.get("supporting_evidence", [])
                    )
            pending = set(identifiers)
            while pending:
                identifier = pending.pop()
                row = db.execute(
                    "SELECT request,parent_id FROM jobs WHERE id=?", (identifier,)
                ).fetchone()
                if row is None:
                    continue
                if row["parent_id"]:
                    ancestor = db.execute(
                        "SELECT id,status,request FROM jobs WHERE id=?", (row["parent_id"],)
                    ).fetchone()
                    if (
                        ancestor is not None
                        and ancestor["status"] in TERMINAL_HISTORY
                        and json.loads(ancestor["request"]) == json.loads(row["request"])
                        and ancestor["id"] not in identifiers
                    ):
                        identifiers.add(ancestor["id"])
                        pending.add(ancestor["id"])
                request = TASK_ADAPTER.validate_json(row["request"])
                from ..datasets.contract import DatasetTask

                if isinstance(request, DatasetTask):
                    for source in request.sources:
                        source_job = str(source.job_id)
                        if source_job not in identifiers:
                            identifiers.add(source_job)
                            pending.add(source_job)
                for reference in references(json.loads(row["request"])):
                    if "scientific_objects" not in tables:
                        break
                    source = db.execute(
                        "SELECT body FROM scientific_objects WHERE id=?", (reference,)
                    ).fetchone()
                    source_job = json.loads(source["body"]).get("source_job") if source else None
                    if source_job and source_job not in identifiers:
                        identifiers.add(source_job)
                        pending.add(source_job)
        self.classify(identifiers)

    def personal_jobs(self, limit, offset):
        self.synchronize()
        with self.store.connect() as db:
            return [
                self.store.decode(row)
                for row in db.execute(
                    "SELECT j.* FROM jobs j WHERE NOT EXISTS "
                    "(SELECT 1 FROM example_library_tasks e WHERE e.job_id=j.id) "
                    "ORDER BY j.created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]
