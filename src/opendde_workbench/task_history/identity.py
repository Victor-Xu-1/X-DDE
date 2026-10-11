"""Read a task's existing origin and immutable case identity without changing it."""

from .example_sources import case_index
from .kinds import classify_request


def task_identity(library, identifier):
    job = library.store.get(str(identifier))
    if job is None:
        return None
    with library.store.connect() as db:
        row = db.execute(
            "SELECT origin FROM example_library_tasks WHERE job_id=?", (job.id,)
        ).fetchone()
        origin = row["origin"] if row else "research"
        if origin not in {"research", "fixed_example", "setup_validation"}:
            raise ValueError("The retained task origin could not be verified.")
        # Pin creation and the history-role refresh are separate existing steps.
        # A directly opened, newly pinned task must use its verified case even
        # before the role index has been refreshed; this read never writes it.
        cases = case_index(db).get(job.id, [])
        if cases:
            origin = "fixed_example"
    return {
        "job_id": job.id,
        "origin": origin,
        "capability_id": classify_request(job.request.model_dump(mode="json")),
        "example_cases": cases,
    }
