"""Actual Biopython rigid superposition, never receptor-flexibility sampling."""


def fit(model, pairs, options):
    import numpy as np
    from Bio.PDB import Superimposer

    fixed = [left[1] for left, _ in pairs]
    moving = [right[1] for _, right in pairs]
    for atoms in (fixed, moving):
        points = np.asarray([a.coord for a in atoms], dtype=float)
        singular = np.linalg.svd(points - points.mean(axis=0), compute_uv=False)
        if len(singular) < 2 or singular[1] <= 1e-6:
            raise ValueError(
                "Collinear/coincident anchors do not determine a stable rigid alignment."
            )
    solver = Superimposer()
    solver.set_atoms(fixed, moving)
    rotation, translation = solver.rotran
    rmsd = float(solver.rms)
    if (
        not np.isfinite(rotation).all()
        or not np.isfinite(translation).all()
        or not np.isfinite(rmsd)
    ):
        raise ValueError("Rigid alignment returned nonfinite evidence.")
    if not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-6) or not np.isclose(
        np.linalg.det(rotation), 1, atol=1e-6
    ):
        raise ValueError("Alignment is not a proper orthogonal rotation.")
    if rmsd > options.maximum_rmsd_angstrom:
        raise ValueError(f"C-alpha RMSD {rmsd:.4f} A exceeds the requested alignment threshold.")
    # Bio.PDB uses a right-multiplying row-vector rotation; record that convention explicitly.
    solver.apply(list(model.get_atoms()))
    coordinates = np.asarray([a.coord for a in model.get_atoms()], dtype=float)
    if not np.isfinite(coordinates).all():
        raise ValueError("Aligned structure contains nonfinite coordinates.")
    return {
        "rotation": rotation.tolist(),
        "translation": translation.tolist(),
        "convention": "row_xyz_times_rotation_plus_translation",
        "rmsd_angstrom": rmsd,
        "residue_pairs": [{"reference": a[2], "moving": b[2]} for a, b in pairs],
    }
