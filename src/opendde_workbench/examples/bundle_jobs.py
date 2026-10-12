"""Terminal retry history is provenance, never a successful scientific dependency."""

from .bundle_projection import row_references

TERMINAL_HISTORY = {"failed", "cancelled", "interrupted"}


def validate_job_history(rows):
    jobs = {row["id"]: row for row in rows["jobs"]}
    if len(jobs) != len(rows["jobs"]):
        raise ValueError("Public case task identities must be unique.")
    failed = {key for key, row in jobs.items() if row["status"] != "succeeded"}
    if not failed:
        return set()
    if any(jobs[key]["status"] not in TERMINAL_HISTORY for key in failed):
        raise ValueError("Public cases cannot retain active or unfinished tasks.")
    scientific = set()
    for name, values in rows.items():
        if name not in {"jobs", "job_environments"}:
            for row in values:
                scientific.update(row_references(row))
    for row in jobs.values():
        scientific.update(row_references({"request": row["request"]}))
    if scientific & failed:
        raise ValueError("A failed task cannot be a pinned result or scientific input dependency.")
    histories = set()
    for child in jobs.values():
        if child["status"] != "succeeded":
            continue
        seen = {child["id"]}
        while child.get("parent_id"):
            parent = jobs.get(child["parent_id"])
            if parent is None:
                raise ValueError("A retained retry ancestor is missing.")
            if parent["id"] in seen:
                raise ValueError("A public task retry history cannot be cyclic.")
            seen.add(parent["id"])
            if parent["status"] != "succeeded":
                if parent["request"] != child["request"]:
                    raise ValueError("Terminal retry history must retain the exact same request.")
                histories.add(parent["id"])
            child = parent
    if histories != failed:
        raise ValueError(
            "Only terminal ancestors of successful exact-request retries are retained."
        )
    return histories
