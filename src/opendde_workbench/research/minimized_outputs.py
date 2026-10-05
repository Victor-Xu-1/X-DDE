"""Qualify only the declared immutable optimized pose before asset registration."""

import json

from ..artifacts import contained
from ..chemistry.minimization_result import validate_minimization


def minimized_output(store, assets, job_id, file):
    job = store.get(str(job_id))
    if not job or job.request.operation != "molecule_minimize":
        return None
    root = assets.root.parent / "jobs" / job.id / "output"
    manifest = contained(root, "result.json")
    if manifest.stat().st_size > 2 * 1024**2:
        raise ValueError("Optimized pose report exceeds its typed limit.")
    result = validate_minimization(json.loads(manifest.read_text()), job.request, root)
    if (
        file.suffix.lower() in {".sdf", ".mol"}
        and file.resolve() != contained(root, result.artifact).resolve()
    ):
        raise ValueError("Only the declared optimized pose may become a new molecular version.")
    return result
