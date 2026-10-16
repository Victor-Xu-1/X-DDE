"""Bounded native dependency proof for a case's exact scientific input versions."""

import hashlib
import json

from pydantic import BaseModel

from ..assets import AssetStore
from ..requests import input_identifiers
from ..research.storage import ScientificStore
from ..scientific_objects import MoleculeRef
from .contracts import JobEvidence
from .evidence import capture_job, verify_job

MAX_SOURCE_DEPTH = 32
MAX_SOURCE_JOBS = 64


def molecule_references(value):
    """Inspect typed request fields; names, notes and UUID-looking text are not edges."""
    if isinstance(value, MoleculeRef):
        yield value
    elif isinstance(value, BaseModel):
        for field in type(value).model_fields:
            yield from molecule_references(getattr(value, field))
    elif isinstance(value, dict):
        for child in value.values():
            yield from molecule_references(child)
    elif isinstance(value, (tuple, list)):
        for child in value:
            yield from molecule_references(child)


class NativeInputLineage:
    def __init__(self, store, prepared):
        self.store, self.state = store, store.path.parent
        self.assets = AssetStore(store, self.state / "assets")
        self.scientific = ScientificStore(store, self.assets)
        self.allowed = {str(obj.reference.asset_id) for obj in prepared.objects.values()}
        families = {str(obj.family_id) for obj in prepared.objects.values()}
        with store.connect() as db:
            self.pins = {}
            for row in db.execute("SELECT job_id,body FROM example_pins"):
                body = json.loads(row["body"])
                if body["case_id"] == prepared.case.id:
                    self.pins[row["job_id"]] = JobEvidence.model_validate(
                        {key: body[key] for key in JobEvidence.model_fields}
                    )
            self.pinned_sources = {}
            for row in db.execute("SELECT family_id,asset_id,body FROM scientific_objects"):
                source_id = json.loads(row["body"])["source_job"]
                if row["family_id"] in families:
                    self.allowed.add(row["asset_id"])
                if source_id in self.pins:
                    self.pinned_sources.setdefault(row["asset_id"], set()).add(source_id)
        self.files, self.outputs, self.proved = {}, {}, set()
        self.active, self.visited = set(), set()

    def validate(self, job, depth=0):
        identifier = str(job.id)
        if identifier in self.active:
            raise ValueError("The scientific lineage contains a cyclic native source graph.")
        if identifier in self.proved:
            return
        self.visited.add(identifier)
        if depth > MAX_SOURCE_DEPTH or len(self.visited) > MAX_SOURCE_JOBS:
            raise ValueError("The scientific lineage exceeds its native source graph budget.")
        self.active.add(identifier)
        try:
            inputs = input_identifiers(job.request)
            if not inputs:
                raise ValueError(
                    "Every task input must belong to this example's scientific lineage."
                )
            references = {}
            for reference in molecule_references(job.request):
                if str(reference.asset_id) in inputs:
                    references.setdefault(str(reference.asset_id), []).append(reference)
            for asset_id in inputs:
                asset = self.asset(asset_id)
                refs = references.get(asset_id, ())
                for ref in refs:
                    self.scientific.validate_reference(ref)
                    if ref.sha256 != asset.sha256:
                        raise ValueError(
                            "Scientific lineage reference bytes differ from the input."
                        )
                if asset_id in self.allowed:
                    continue
                if any(
                    asset.sha256 in self.native_outputs(source_id)
                    for source_id in self.pinned_sources.get(asset_id, ())
                ):
                    continue
                if not refs:
                    raise ValueError(
                        "Every task input must belong to this example's scientific lineage."
                    )
                if any(ref.version_id is None for ref in refs):
                    raise ValueError(
                        "The scientific lineage requires an exact saved scientific version."
                    )
                for ref in refs:
                    version = self.scientific.get(ref.version_id)
                    source_id = str(version.source_job) if version.source_job else None
                    source = self.store.get(source_id) if source_id else None
                    if source is None:
                        raise ValueError("Every task input must retain this case's native lineage.")
                    if ref.sha256 not in self.native_outputs(source_id):
                        raise ValueError("The scientific version is not a retained native output.")
                    self.validate(source, depth + 1)
            self.proved.add(identifier)
        finally:
            self.active.remove(identifier)

    def asset(self, identifier):
        if identifier not in self.files:
            asset = self.assets.get(identifier)
            with self.assets.path(asset).open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest != asset.sha256:
                raise ValueError("Scientific lineage input bytes changed.")
            self.files[identifier] = asset
        return self.files[identifier]

    def native_outputs(self, identifier):
        if identifier not in self.outputs:
            if len(self.outputs) >= MAX_SOURCE_JOBS:
                raise ValueError("The scientific lineage exceeds its native source graph budget.")
            evidence = self.pins.get(identifier) or capture_job(self.store, self.state, identifier)
            verify_job(self.store, self.state, evidence)
            self.outputs[identifier] = set(evidence.artifact_sha256.values())
        return self.outputs[identifier]


def validate_input_lineage(job, prepared, store):
    NativeInputLineage(store, prepared).validate(job)
