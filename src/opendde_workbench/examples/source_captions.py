"""Readable molecular names projected from exact retained files and dataset records."""

import hashlib
import json

from ..artifacts import contained
from ..chemistry.sdf_io import split_records
from ..datasets.contract import DatasetTask
from ..datasets.result import validate_result


def source_label(scientific, molecule):
    """Never rename a sealed task or take a caption from an unrelated record."""
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
        label = _dataset_label(scientific.store, source, molecule)
        if label:
            return label
        if asset.suffix in {".sdf", ".mol"}:
            record = split_records(raw)[molecule.record] if asset.suffix == ".sdf" else raw
            title = record.splitlines()[0].decode("utf-8").strip()
            if _readable(title):
                return title
        return source.label
    except (KeyError, OSError, ValueError, IndexError, UnicodeError):
        # Missing/corrupt metadata cannot supply an unrelated molecular name.
        return None


def _readable(label):
    return bool(label) and len(label) <= 120 and all(char.isprintable() for char in label)


def _dataset_label(store, source, molecule):
    if source.source_job is None:
        return None
    job = store.get(str(source.source_job))
    if job is None or job.status != "succeeded" or not isinstance(job.request, DatasetTask):
        return None
    root = store.path.parent / "jobs" / job.id / "output"
    manifest = contained(root, "result.json")
    with manifest.open("rb") as stream:
        raw = stream.read(4 * 1024**2 + 1)
    if len(raw) > 4 * 1024**2:
        return None
    # The source SDF's full checksum was checked above. Other potentially large
    # native artifacts need containment/size checks here, not another full scan.
    result = validate_result(json.loads(raw), job.request, root, full_hash=False)
    names = {
        artifact.name
        for artifact in result.artifacts
        if artifact.format == "sdf" and artifact.sha256 == molecule.sha256
    }
    matches = [
        candidate
        for candidate in result.candidates
        if candidate.artifact in names and candidate.record == molecule.record
    ]
    if len(matches) == 1 and _readable(matches[0].display_name):
        return matches[0].display_name
    return None
