"""Read the native alignment evidence behind one immutable receptor collection."""

import hashlib
import json

from ..artifacts import contained
from ..research.receptor_sets import ReceptorSets
from .result import validate_result


def read_bounded(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 25 * 1024**2:
        raise ValueError("Scientific evidence is absent, unsafe or oversized.")
    with path.open("rb") as stream:
        data = stream.read(25 * 1024**2 + 1)
    if len(data) > 25 * 1024**2:
        raise ValueError("Scientific evidence grew beyond its size limit.")
    return data, hashlib.sha256(data).hexdigest()


def aligned_ensemble(store, assets, settings, identifier):
    ensemble = ReceptorSets(store, assets).get(identifier)
    job = store.get(str(ensemble.source_job))
    if not job or job.status != "succeeded" or job.request.operation != "receptor_ensemble":
        raise ValueError("Use an actual successful receptor alignment task.")
    root = settings.state_dir / "jobs" / job.id / "output"
    raw, _ = read_bounded(contained(root, "result.json"))
    result = validate_result(json.loads(raw), job.request, root)
    if (
        tuple(member.evidence for member in ensemble.members) != result.members
        or ensemble.inputs != result.inputs
        or ensemble.options != result.options
    ):
        raise ValueError("Receptor collection differs from its verified alignment output.")
    return ensemble
