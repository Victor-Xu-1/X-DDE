"""A reviewed initial view references an existing native candidate without reranking it."""

import json

from ..artifacts import contained
from ..integrations.contract import IntegratedTask
from ..integrations.result import validate_result


def validate_initial_candidate(identifier, review, job, state):
    if identifier is None:
        return
    if review is None:
        raise ValueError("Selecting an initial candidate requires an explicit example review.")
    if not isinstance(job.request, IntegratedTask):
        raise ValueError("Initial candidate views require a native integrated candidate result.")
    output = state / "jobs" / str(job.id) / "output"
    path = contained(output, "result.json")
    if path.stat().st_size > 16 * 1024**2:
        raise ValueError("The native candidate report exceeds the review size budget.")
    result = validate_result(json.loads(path.read_text(encoding="utf-8")), job.request, output)
    if identifier not in {candidate.id for candidate in result.candidates}:
        raise ValueError("The selected initial candidate is absent from the exact native result.")
