"""Select current public cases by typed references; never export a whole database."""

import json
from uuid import UUID

from ..requests import TASK_ADAPTER, input_identifiers
from .catalogue import MODULES

TABLES = (
    "jobs",
    "job_environments",
    "assets",
    "scientific_objects",
    "research_regions",
    "research_evidence",
    "research_receptor_sets",
    "research_site_sets",
    "research_pose_explorations",
    "research_pose_sets",
    "workflow_plans",
    "workflow_runs",
    "workflow_attempts",
    "design_plans",
    "projects",
    "example_pins",
    "example_record_pins",
)
# Text, filenames, notes, labels and user metadata are not relationship authorities.
REFERENCE_KEYS = {
    "id",
    "asset_id",
    "version_id",
    "parent_id",
    "source_job",
    "job_id",
    "model_job",
    "identity_job",
    "ensemble_id",
    "pose_set_id",
    "receptor_set_id",
    "site_set_id",
    "exploration_id",
    "run_id",
    "plan_id",
    "project_id",
    "record_id",
    "source_job_ids",
    "assets",
    "ligands",
    "sequence_assets",
}
JSON_COLUMNS = {"body", "request", "record", "config", "summary"}


def references(value):
    result = set()

    def walk(item, key=""):
        if isinstance(item, dict):
            for name, child in item.items():
                if name not in {"notes", "description", "label", "name", "family_id"}:
                    walk(child, name)
        elif isinstance(item, (list, tuple)):
            for child in item:
                walk(child, key)
        elif key in REFERENCE_KEYS and isinstance(item, str):
            try:
                result.add(str(UUID(item)))
            except ValueError:
                pass

    walk(value)
    return result


def row_references(row):
    value = dict(row)
    for column in JSON_COLUMNS & value.keys():
        if value[column] is not None:
            value[column] = json.loads(value[column])
    result = references(value)
    if "request" in row:
        result.update(input_identifiers(TASK_ADAPTER.validate_json(row["request"])))
    return result


def project_records(store, roots, *, capabilities=None):
    selected = {name: [] for name in TABLES}
    identifiers, seen = set(roots), set()
    with store.connect() as db:
        rows = {name: [dict(row) for row in db.execute("SELECT * FROM " + name)] for name in TABLES}
        for name in ("example_pins", "example_record_pins"):
            for index, row in enumerate(rows[name]):
                module = MODULES.get(row["capability_id"])
                if (
                    module
                    and row["revision"] == module.revision
                    and (capabilities is None or row["capability_id"] in capabilities)
                ):
                    selected[name].append(row)
                    identifiers.update(row_references(row))
                    seen.add((name, index))
        changed = True
        while changed:
            changed = False
            job_ids = {row["id"] for row in selected["jobs"]}
            run_ids = {row["id"] for row in selected["workflow_runs"]}
            for name, values in rows.items():
                for index, row in enumerate(values):
                    if (name, index) in seen or name in {"example_pins", "example_record_pins"}:
                        continue
                    included = row.get("id") in identifiers
                    if name == "job_environments":
                        included = row["job_id"] in job_ids
                    elif name == "scientific_objects" and not included:
                        body = json.loads(row["body"])
                        included = body.get("source_job") in job_ids and body.get("validation") in {
                            "native_prepared",
                            "native_generated",
                        }
                    elif name == "workflow_attempts":
                        included = row["run_id"] in run_ids
                    if included:
                        selected[name].append(row)
                        identifiers.update(row_references(row))
                        seen.add((name, index))
                        changed = True
    if any(row["status"] != "succeeded" for row in selected["jobs"]):
        raise ValueError("A public result bundle cannot contain unfinished or failed tasks.")
    return selected
