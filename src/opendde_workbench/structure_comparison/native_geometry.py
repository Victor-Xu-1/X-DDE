"""One target-fitted frame for partner RMSD, per-residue evidence and structural export."""

import math

from native_fit import rigid_solver


def pair_evidence(pairs, rotation, translation, role):
    import numpy as np

    rows = []
    for reference, moving in pairs:
        fixed = np.asarray(reference[1].coord, dtype=float)
        source = np.asarray(moving[1].coord, dtype=float)
        aligned = source @ rotation + translation
        if not np.isfinite(fixed).all() or not np.isfinite(aligned).all():
            raise ValueError("Mapped structural coordinates are not finite.")
        rows.append(
            {
                "role": role,
                "reference": reference[2],
                "moving": moving[2],
                "reference_letter": reference[0],
                "moving_letter": moving[0],
                "reference_position": fixed.tolist(),
                "moving_source_position": source.tolist(),
                "moving_aligned_position": aligned.tolist(),
                "displacement_angstrom": float(np.linalg.norm(aligned - fixed)),
            }
        )
    if not rows:
        raise ValueError("A comparison role requires observed matched residues.")
    return rows


def compare_frame(model, target_pairs, partner_pairs):
    import numpy as np

    solver = rigid_solver(target_pairs)
    rotation, translation = solver.rotran
    target = pair_evidence(target_pairs, rotation, translation, "target")
    partner = pair_evidence(partner_pairs, rotation, translation, "partner")
    partner_rmsd = math.sqrt(
        sum(row["displacement_angstrom"] ** 2 for row in partner) / len(partner)
    )
    # Preserve source endpoints before using Biopython's native transform on the selected model.
    solver.apply(list(model.get_atoms()))
    if not np.isfinite(np.asarray([atom.coord for atom in model.get_atoms()], dtype=float)).all():
        raise ValueError("Aligned comparison coordinates must remain finite.")
    return {
        "rotation": rotation.tolist(),
        "translation": translation.tolist(),
        "convention": "row_xyz_times_rotation_plus_translation",
        "target_rmsd_angstrom": float(solver.rms),
        "partner_rmsd_angstrom": partner_rmsd,
        "matched_target_ca": len(target),
        "matched_partner_ca": len(partner),
        "residue_displacements": target + partner,
    }
