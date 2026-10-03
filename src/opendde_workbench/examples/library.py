"""Fixed examples are a module library, not the user's personal task history."""

import json

from ..requests import TASK_ADAPTER
from ..store import now
from .bundle_projection import references
from .catalogue import MODULES


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
                db.execute(
                    "INSERT OR IGNORE INTO example_library_tasks VALUES(?,?,?)",
                    (str(identifier), origin, now()),
                )
                if request.project_id:
                    db.execute(
                        "INSERT OR IGNORE INTO example_library_projects VALUES(?)",
                        (str(request.project_id),),
                    )

    def synchronize(self):
        # Follow only current immutable pin evidence and its explicitly referenced input versions.
        identifiers = set()
        with self.store.connect() as db:
            tables = {
                row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            for table in ("example_pins", "example_record_pins"):
                if table not in tables:
                    continue
                for row in db.execute("SELECT capability_id,revision,body FROM " + table):
                    module = MODULES.get(row["capability_id"])
                    if module is None or module.revision != row["revision"]:
                        continue
                    body = json.loads(row["body"])
                    if table == "example_pins":
                        identifiers.add(body["job_id"])
                    else:
                        identifiers.update(entry["job_id"] for entry in body["evidence"])
            pending = set(identifiers)
            while pending and "scientific_objects" in tables:
                identifier = pending.pop()
                row = db.execute("SELECT request FROM jobs WHERE id=?", (identifier,)).fetchone()
                if row is None:
                    continue
                for reference in references(json.loads(row["request"])):
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
