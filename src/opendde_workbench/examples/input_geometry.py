"""Reviewed, immutable preparation evidence for packaged computed input conformers."""

import hashlib
import math

from .stat6 import catalogue


def verified_computed_input(asset, raw):
    """Qualify exact reviewed bytes; arbitrary 3D headers/properties confer no trust.

    Preparation occurred before packaging and is independently checked in CI.
    This authority preserves reviewed computed coordinates, not measured affinity.
    Additional reviewed study profiles extend this registry instead of viewer logic.
    """
    for row in catalogue.MANIFEST["molecules"]:
        if asset.name != row["file"] or asset.sha256 != row["sha256"]:
            continue
        spec = next(file for file in catalogue.FILES.values() if file.name == row["file"])
        approved = catalogue.verified_input(spec.key)
        if hashlib.sha256(raw).hexdigest() != spec.sha256 or raw != approved:
            raise ValueError("The reviewed computed input bytes changed.")
        if not (
            row["geometry"] == "computed_unbound_conformer"
            and not row["binding_pose"]
            and row["minimization_converged"]
            and row["force_field"] == "MMFF94s"
            and math.isfinite(row["energy_kcal_mol"])
            and row["nonplanarity_singular_value"] > 0.05
        ):
            raise ValueError("The reviewed input has no converged spatial preparation evidence.")
        return True
    native = catalogue.MANIFEST.get("supporting_sources", {}).get("native_pose", {})
    if native.get("status") != "succeeded" or not native.get("job_id") or not native.get("method"):
        return False
    for key in (native.get("pose_key"), native.get("poses_key")):
        spec = catalogue.FILES.get(key)
        if spec is None or (asset.name, asset.sha256) != (spec.name, spec.sha256):
            continue
        if raw != catalogue.verified_input(key) or hashlib.sha256(raw).hexdigest() != spec.sha256:
            raise ValueError("The reviewed native pose bytes changed.")
        # Only the exact bundled native output qualifies; do not recompute its
        # unbound geometry or silently change the paired receptor coordinate frame.
        return True
    return False
