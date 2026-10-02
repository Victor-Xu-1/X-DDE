"""Reuse verified native domain files rather than silently cutting antibody sequences."""

import hashlib
import json
from uuid import UUID, uuid5

from ..antibodies.result import validate_numbering
from ..artifacts import contained
from ..research.contracts import VersionInput
from .pins import ExamplePins

NAMESPACE = UUID("7c8bccb7-ad31-4cbf-bcec-04ba7425043c")


def prepared_receptor(scientific, state, original):
    pin = ExamplePins(scientific.store, state).get("biopython.prepare", verify=True)
    if pin is None:
        return None
    job = scientific.store.get(str(pin.job_id))
    if str(job.request.structure.asset_id) != str(original.reference.asset_id):
        raise ValueError("The prepared case receptor uses another original structure.")
    candidates = [
        obj
        for obj in scientific.list(source_job=pin.job_id)
        if obj.kind == "structure" and pin.artifact_sha256.get(obj.label) == obj.reference.sha256
    ]
    if len(candidates) != 1:
        raise ValueError("The prepared case has no unique retained receptor version.")
    return candidates[0]


def variable_domains(scientific, state, original):
    pin = ExamplePins(scientific.store, state).get("antibody.number", verify=True)
    if pin is None:
        return None
    job = scientific.store.get(str(pin.job_id))
    if str(job.request.sequences.asset_id) != str(original.reference.asset_id):
        raise ValueError("The numbered example uses another original sequence.")
    output = state / "jobs" / str(pin.job_id) / "output"
    value = json.loads(contained(output, "result.json").read_text())
    result = validate_numbering(value, job.request, output)
    domains = [domain for domain in result.domains if domain.available]
    if len(domains) != 2 or not all(70 <= len(domain.sequence) <= 200 for domain in domains):
        raise ValueError("The antibody example requires two verified variable domains.")
    data = b"".join(contained(output, domain.artifact).read_bytes() for domain in domains)
    asset = scientific.assets.save("trastuzumab-variable-domains.fasta", "sequences", data)
    matches = [
        value
        for value in scientific.list(source_job=pin.job_id)
        if value.kind == "sequence"
        and value.parent_id == original.id
        and value.reference.sha256 == asset.sha256
    ]
    if len(matches) > 1:
        raise ValueError("The domain source has ambiguous retained sequence versions.")
    if matches:
        return matches[0]
    key = uuid5(NAMESPACE, str(pin.job_id) + hashlib.sha256(data).hexdigest() + str(original.id))
    return scientific.create(
        VersionInput(
            asset_id=asset.id,
            kind="sequence",
            label="Trastuzumab · native VH/VL domains",
            parent_id=original.id,
            relation="prepared_from",
            notes="Unchanged native ANARCII FASTA domains from the fixed numbering case.",
        ),
        key,
        source_job=pin.job_id,
        validation="native_prepared",
    )
