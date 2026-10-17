"""Follow-up results must consume computed case outputs, never unrelated personal work."""

import hashlib
import json
from collections import Counter

from ..chemistry.sdf_io import split_records
from ..requests import input_identifiers
from .bundle_projection import references
from .evidence import capture_job


def supporting_stage_names(store, pin, scientific):
    """Preserve authored names, identifying repeated minimizations by their exact source."""
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
        if repeated[names[identifier]] < 2 or job.request.operation != "molecule_minimize":
            continue
        molecule = job.request.molecule
        if molecule.version_id is None:
            continue
        label = _source_label(scientific, molecule)
        if label:
            names[identifier] += " · " + label
    return names


def _source_label(scientific, molecule):
    """Read an exact bounded native record title, retaining authored labels as fallback."""
    try:
        source = scientific.get(molecule.version_id)
        if source.kind != "molecule" or source.reference != molecule:
            return None
        asset = scientific.assets.get(molecule.asset_id)
        if asset.size > 25 * 1024**2 or asset.sha256 != molecule.sha256:
            return None
        with scientific.assets.path(asset).open("rb") as stream:
            raw = stream.read(25 * 1024**2 + 1)
        if hashlib.sha256(raw).hexdigest() != molecule.sha256:
            return None
        if asset.suffix in {".sdf", ".mol"}:
            record = split_records(raw)[molecule.record] if asset.suffix == ".sdf" else raw
            title = record.splitlines()[0].decode("utf-8").strip()
            if title and len(title) <= 120 and all(char.isprintable() for char in title):
                return title
        return source.label
    except (KeyError, OSError, ValueError, IndexError, UnicodeError):
        # Missing/corrupt source metadata cannot supply an unrelated molecular name.
        return None


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
