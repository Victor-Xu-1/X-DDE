"""Initial free-ligand poses reuse scientific versions and the existing Chemistry queue."""

from ..chemistry.minimization_contract import MoleculeMinimizeTask
from ..chemistry.minimization_options import MinimizationOptions
from ..chemistry.sdf_io import split_records
from ..models import Status
from .pose_sources import PoseSources

# Only operations that compute coordinates qualify. ADMET, descriptors, library
# import, editing and a file's 3D header alone are not computational evidence.
COMPUTED_OPERATIONS = {
    "molecule_minimize",
    "molecular_states",
    "docking",
    "diffsbdd",
    "dataset_dock",
}


class InitialPosePreparation:
    def __init__(self, store, assets, settings):
        self.store, self.assets = store, assets
        self.sources = PoseSources(store, assets, settings)

    def resolve(self, value):
        reference = self.sources.resolve(value.source)
        asset = self.assets.get(reference.asset_id)
        raw = self.assets.path(asset).read_bytes()
        record = split_records(raw)[reference.record] if asset.suffix == ".sdf" else raw
        lines = record.splitlines()
        valid_record = (
            (b"@<TRIPOS>MOLECULE" in raw and b"@<TRIPOS>ATOM" in raw)
            if asset.suffix == ".mol2"
            else len(lines) >= 4 and any(b"M  END" in line for line in lines)
        )
        if not valid_record:
            raise ValueError("An initial pose requires a valid molecular SDF/MOL record.")
        is_3d = asset.suffix != ".mol2" and b"3D" in lines[1]
        version = self.sources.scientific.get(reference.version_id)
        parent = self.store.get(str(version.source_job)) if version.source_job else None
        if (
            is_3d
            and parent
            and parent.status == Status.SUCCEEDED
            and parent.request.operation in COMPUTED_OPERATIONS
        ):
            # The source resolver already validates the exact asset/version and
            # declared native output. Return this pose without changing its frame.
            return None, version
        return MoleculeMinimizeTask(
            name="Initial optimized 3D preview",
            molecule=reference,
            options=MinimizationOptions(force_field=value.method, initialize_3d=True),
            scientific_inputs=[reference],
        ), None
