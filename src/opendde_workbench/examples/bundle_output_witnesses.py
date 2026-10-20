"""Retain minimal native output versions used to prove shared-file follow-up lineage."""

import hashlib
import json
from pathlib import Path

from ..assets import AssetStore
from ..research.contracts import ScientificObject
from ..research.output_identity import artifact_key
from ..research.storage import EXPECTED, version_identifier
from .evidence import capture_job


class OutputWitnesses:
    def __init__(self, store):
        self.store, self.state = store, store.path.parent
        self.assets = AssetStore(store, self.state / "assets")
        self.evidence = {}

    def includes(self, row, job_ids, input_assets, pinned_sources):
        if row["asset_id"] not in input_assets:
            return False
        body = json.loads(row["body"])
        source = body.get("source_job")
        # Preserve the already reviewed source pin when a newer case consumes
        # its exact native file. Admission remains the same as the owner store;
        # an arbitrary old version or annotation is not a source authority.
        if source not in job_ids and source not in pinned_sources:
            return False
        reference = body.get("reference", {})
        # File-level admission needs one deterministic, automatically indexed
        # witness; manually registered copies and other records are not witnesses.
        if reference.get("record") != 0 or reference.get("conformer") != 0:
            return False
        asset = self.assets.get(row["asset_id"])
        if row["id"] != version_identifier(artifact_key(source, asset.id, asset.kind, 0)):
            return False
        obj = ScientificObject.model_validate(body)
        if (
            str(obj.id) != row["id"]
            or str(obj.reference.version_id) != row["id"]
            or str(obj.reference.asset_id) != asset.id
            or obj.reference.sha256 != asset.sha256
            or EXPECTED[obj.kind] != asset.kind
        ):
            raise ValueError("The native output witness differs from its registered file.")
        with self.assets.path(asset).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != asset.sha256:
                raise ValueError("The native output witness file changed.")
        if source not in self.evidence:
            self.evidence[source] = capture_job(self.store, self.state, source)
        if not any(
            Path(name).name == asset.name and digest == asset.sha256
            for name, digest in self.evidence[source].artifact_sha256.items()
        ):
            raise ValueError("The output witness is not a retained native artifact.")
        # Keep the original version and its validation label, including
        # file_integrity_only. This does not upgrade scientific acceptance.
        return True
