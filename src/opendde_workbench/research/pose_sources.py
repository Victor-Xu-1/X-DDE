"""Resolve preview selections through the existing scientific version/file authority."""

import hashlib
import json

from ..artifacts import contained
from ..chemistry.sdf_io import split_records
from ..models import Status
from .contracts import VersionInput
from .outputs import OutputCatalog
from .pose_contract import ArtifactPoseSource, AssetPoseSource
from .storage import ScientificStore

CONSTRAINT_NOTICE = (
    "Review and transfer existing molecular constraints before optimizing this pose."
)


class PoseSources:
    def __init__(self, store, assets, settings):
        self.store, self.assets, self.settings = store, assets, settings
        self.scientific = ScientificStore(store, assets)
        self.outputs = OutputCatalog(store, assets)

    def resolve(self, source, *, receptor=False):
        kind = "structure" if receptor else "molecule"
        if isinstance(source, ArtifactPoseSource):
            job = self.store.get(str(source.job_id))
            if not job or job.status != Status.SUCCEEDED:
                raise ValueError("Only a successful task's qualified pose can be minimized.")
            if job.request.constraints:
                raise ValueError(CONSTRAINT_NOTICE)
            root = self.settings.state_dir / "jobs" / job.id / "output"
            file = contained(root, source.name)
            if job.request.operation == "pose_quality":
                from ..quality.result import validate_quality

                manifest = contained(root, "result.json")
                if manifest.stat().st_size > 2 * 1024**2:
                    raise ValueError("Pose quality report exceeds its bounded limit.")
                validate_quality(json.loads(manifest.read_text()), job.request, root)
                expected = "protein-preview.pdb" if receptor else "molecule-preview.sdf"
                if source.name != expected or source.record:
                    raise ValueError("Choose the declared quality preview record.")
                return job.request.protein if receptor else job.request.molecule
            if job.request.operation == "molecular_states" and not receptor:
                from ..chemistry.result import validate_result

                manifest = contained(root, "result.json")
                if manifest.stat().st_size > 2 * 1024**2:
                    raise ValueError("Molecular preparation report exceeds its typed limit.")
                result = validate_result(json.loads(manifest.read_text()), job.request, root)
                conformer = next((c for c in result.conformers if c.artifact == source.name), None)
                if conformer:
                    if source.record:
                        raise ValueError("An individual conformer preview has only record 0.")
                    _, versions = self.outputs.preserve(
                        job.id, contained(root, result.conformer_artifact), "ligand"
                    )
                    return next(
                        v.reference for v in versions if v.reference.record == conformer.record
                    )
            if job.request.operation == "docking" and not receptor:
                result = self.outputs.docking_output(job.id, file)
                if result is None or not any(
                    p.valid and p.artifact == source.name for p in result.poses
                ):
                    raise ValueError(
                        "Choose an individually qualified docking pose, not a diagnostic bundle."
                    )
            asset, versions = self.outputs.preserve(
                job.id, file, "structure" if receptor else "ligand"
            )
            self.validate_file(asset, source.record, receptor)
            version = next(
                (v for v in versions if v.reference.record == source.record and v.kind == kind),
                None,
            )
            if version is None:
                raise ValueError(
                    "The exact preview record is not available as a scientific version."
                )
            return version.reference
        if isinstance(source, AssetPoseSource):
            asset = self.assets.get(source.asset_id)
            self.validate_file(asset, source.record, receptor)
            version = self.scientific.find_asset(asset.id, source.record, kind)
            if version is None:
                version = self.scientific.create(
                    VersionInput(
                        asset_id=asset.id, kind=kind, label=asset.name[:120], record=source.record
                    ),
                    f"preview-pose:{asset.id}:{kind}:{source.record}",
                )
            self.scientific.validate_reference(version.reference)
            self.check_constraints(version)
            return version.reference
        version = self.scientific.get(source.version_id)
        if version.kind != kind:
            raise ValueError(
                "The selected version does not contain the requested molecule/receptor."
            )
        self.validate_file(
            self.assets.get(version.reference.asset_id), version.reference.record, receptor
        )
        self.scientific.validate_reference(version.reference)
        self.check_constraints(version)
        return version.reference

    def check_constraints(self, version):
        job = self.store.get(str(version.source_job)) if version.source_job else None
        if job and job.request.constraints:
            raise ValueError(CONSTRAINT_NOTICE)

    def validate_file(self, asset, record, receptor):
        suffixes = {".pdb", ".cif"} if receptor else {".sdf", ".mol", ".mol2"}
        if asset.kind != ("structure" if receptor else "ligand") or asset.suffix not in suffixes:
            raise ValueError(
                "Choose a receptor PDB/CIF or a ligand SDF/MOL with explicit chemical bonds."
            )
        file = self.assets.path(asset)
        if file.stat().st_size > 25 * 1024**2:
            raise ValueError("Preview source exceeds the 25 MiB limit.")
        raw = file.read_bytes()
        if hashlib.sha256(raw).hexdigest() != asset.sha256:
            raise ValueError("Preview file changed after registration.")
        count = len(split_records(raw)) if asset.suffix == ".sdf" else 1
        if not 0 <= record < count:
            raise ValueError("Select an existing record from this preview file.")
