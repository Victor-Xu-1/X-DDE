"""Chemical correspondences between independent binary and initialized ligand frames."""

import numpy as np


def local_binary_coordinates(points):
    """Remove only a binary ligand's arbitrary world translation before float32 use."""
    coordinates = np.asarray(points, dtype=np.float64)
    if (
        coordinates.ndim != 2
        or coordinates.shape[1] != 3
        or not 3 <= len(coordinates) <= 256
        or not np.isfinite(coordinates).all()
        or np.abs(coordinates).max() > 100000
    ):
        raise ValueError(
            "Binary ligand coordinates must be finite, bounded three-dimensional points."
        )
    # Source SDF coordinates have 1e-4-A precision. A 1e-8-A local grid removes
    # floating-point cancellation noise without changing chemical geometry at
    # source precision. Normalize a computational copy, never the native asset.
    return np.round(coordinates - coordinates[0], decimals=8)


def pocket_in_ligand_frame(arm, mapping, generated, selected):
    """Keep observed arm geometry; place it beside its chemically mapped conformer atoms."""
    moving = np.asarray(arm, dtype=np.float64)
    whole = np.asarray(generated, dtype=np.float64)
    if moving.shape != (len(mapping), 3) or whole.ndim != 2 or whole.shape[1] != 3:
        raise ValueError("Pocket frames need exact three-dimensional chemical correspondences.")
    if len(set(mapping)) != len(mapping) or not all(0 <= index < len(whole) for index in mapping):
        raise ValueError("Pocket atom correspondences must be unique and in range.")
    lookup = {full: local for local, full in enumerate(mapping)}
    if len(set(selected)) != len(selected) or not set(selected) <= lookup.keys():
        raise ValueError("Pocket selection changed its known full-molecule atom identities.")
    target = whole[list(mapping)]
    if not np.isfinite(moving).all() or not np.isfinite(whole).all():
        raise ValueError("Pocket frames must contain finite physical coordinates.")
    a, b = moving - moving.mean(0), target - target.mean(0)
    if min(np.linalg.matrix_rank(a), np.linalg.matrix_rank(b)) < 2:
        raise ValueError("Pocket alignment needs non-collinear chemical correspondences.")
    left, _, right = np.linalg.svd(a.T @ b)
    correction = np.eye(3)
    correction[-1, -1] = np.sign(np.linalg.det(left @ right))
    rotation = left @ correction @ right
    transformed = a @ rotation + target.mean(0)
    return transformed[[lookup[index] for index in selected]]


def canonical_prediction(prediction, anchor):
    """Keep output partner A in its source frame even when native partner 1 is B."""
    if anchor == "a":
        return prediction
    if anchor != "b":
        raise ValueError("Unknown fixed protein partner.")
    rotation = np.asarray(prediction["rotation"], dtype=np.float64)
    translation = np.asarray(prediction["translation"], dtype=np.float64).reshape(3)
    ligand = np.asarray(prediction["ligand_positions"], dtype=np.float64)
    if (
        rotation.shape != (3, 3)
        or ligand.ndim != 2
        or ligand.shape[1] != 3
        or not all(np.isfinite(value).all() for value in (rotation, translation, ligand))
        or not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-4, rtol=0)
        or abs(np.linalg.det(rotation) - 1) > 1e-4
    ):
        raise ValueError("The alternate anchor needs one proper native rigid transform.")
    inverse = rotation.T
    offset = -inverse @ translation
    return {
        **prediction,
        "rotation": inverse,
        # DeepTernary's native rotate_and_translate requires a 1x3 row.
        "translation": offset.reshape(1, 3),
        "ligand_positions": ligand @ inverse.T + offset,
    }
