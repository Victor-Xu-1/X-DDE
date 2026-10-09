"""Reviewed, immutable preparation evidence for packaged computed input conformers."""

import hashlib
import math

from .stat6 import catalogue


def verified_computed_input(asset, raw):
    """Qualify exact reviewed bytes; arbitrary 3D headers/properties confer no trust.

    Preparation occurred before packaging and is independently checked in CI.
    This authority does not assert docking, receptor alignment or binding affinity.
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
    return False
