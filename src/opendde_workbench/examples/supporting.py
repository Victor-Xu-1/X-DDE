"""Follow-up results must consume computed case outputs, never unrelated personal work."""

import json
from collections import Counter

from ..requests import input_identifiers
from .bundle_projection import references
from .evidence import capture_job
from .source_captions import source_label


def supporting_stage_names(store, pin, scientific):
    """Preserve authored names; identify repeated molecular follow-ups by exact source."""
    names = {}
    jobs = {}
    for entry in pin.supporting_evidence if pin else ():
        job = store.get(str(entry.job_id))
        name = getattr(job.request, "name", None) if job else None
        if name:
            names[str(entry.job_id)] = name
            jobs[str(entry.job_id)] = job
    repeated = Counter(names.values())
    for identifier, job in jobs.items():
        if repeated[names[identifier]] < 2 or job.request.operation not in {
            "molecule_minimize",
            "pose_quality",
        }:
            continue
        molecule = job.request.molecule
        if molecule.version_id is None:
            continue
        label = source_label(scientific, molecule)
        if label:
            names[identifier] += " · " + label
    return names


def supporting_evidence(store, state, primary, prepared, identifiers):
    allowed_inputs = {str(value.reference.asset_id) for value in prepared.objects.values()}
    allowed_inputs.update(input_identifiers(primary.request))
    return _followups(store, state, {primary.id}, allowed_inputs, identifiers)


def record_supporting_evidence(store, state, source_jobs, identifiers):
    """Record roots come from its verified native run, never caller-provided extra roots."""
    roots = set(map(str, source_jobs))
    allowed_inputs = set()
    for identifier in roots:
        job = store.get(identifier)
        if job is None or job.status != "succeeded":
            raise ValueError("Record follow-ups require successful native source tasks.")
        allowed_inputs.update(input_identifiers(job.request))
    return _followups(store, state, roots, allowed_inputs, identifiers)


def _followups(store, state, roots, allowed_inputs, identifiers):
    identifiers = tuple(map(str, identifiers))
    if len(set(identifiers)) != len(identifiers) or roots.intersection(identifiers):
        raise ValueError("Supporting task identities must be unique and distinct from the primary.")
    known_jobs = set(roots)
    evidence = []
    for identifier in identifiers:
        job = store.get(identifier)
        if job is None or job.status != "succeeded":
            raise ValueError("Only successful native follow-up results can support a fixed case.")
        with store.connect() as db:
            outputs = [
                row
                for row in db.execute("SELECT id,asset_id,body FROM scientific_objects")
                if json.loads(row["body"]).get("source_job") in known_jobs
            ]
        descendants = {row["asset_id"] for row in outputs}
        versions = {row["id"] for row in outputs}
        inputs = input_identifiers(job.request)
        # Content-addressed files can be shared by distinct scientific versions.
        # Consume the exact earlier output version, not just coincident file bytes.
        if (
            not inputs
            or not references(job.request.model_dump(mode="json")) & versions
            or not inputs <= allowed_inputs | descendants
        ):
            raise ValueError(
                "Supporting results must consume computed case outputs in dependency order; "
                "every other input must retain the same reviewed case lineage."
            )
        evidence.append(capture_job(store, state, job.id))
        allowed_inputs.update(descendants)
        known_jobs.add(job.id)
    return tuple(evidence)
