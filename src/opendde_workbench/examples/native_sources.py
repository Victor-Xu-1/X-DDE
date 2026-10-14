"""Retain the declared native potential files, beyond the general download extension list."""

import json

from ..artifacts import contained
from ..integrations.result import validate_result


def potential_sources(job, output):
    if job.request.operation != "electrostatics":
        return {}
    manifest = contained(output, "result.json")
    if manifest.stat().st_size > 4 * 1024**2:
        raise ValueError("The public potential summary exceeds its bounded read limit.")
    result = validate_result(json.loads(manifest.read_bytes()), job.request, output)
    return {name: contained(output, name) for name in result.artifact_sha256}
