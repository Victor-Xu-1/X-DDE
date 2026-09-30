"""Output-only receptor-frame checks. No scoring, searching or empirical calibration."""

import math


def assess(mol, condition):
    """Read actual RDKit coordinates; the centroid is unweighted over heavy atoms."""
    indices = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    if not indices or len(indices) > 256 or mol.GetNumConformers() != 1:
        raise ValueError("Spatial verification requires one bounded heavy-atom conformer.")
    conformer = mol.GetConformer()
    if not conformer.Is3D():
        raise ValueError("Spatial verification requires a three-dimensional conformer.")
    points = [(i, tuple(conformer.GetAtomPosition(i))) for i in indices]
    if not all(math.isfinite(v) for _, point in points for v in point):
        raise ValueError("Spatial verification cannot use nonfinite coordinates.")
    selection = condition["selection"]
    if selection == "heavy_atom_centroid":
        points = [
            (None, tuple(sum(point[j] for _, point in points) / len(points) for j in range(3)))
        ]
    elif selection != "all_heavy_atoms":
        raise ValueError("Unsupported output selection.")
    center, size = condition["box"]["center"], condition["box"]["size"]
    if (
        len(center) != 3
        or len(size) != 3
        or not all(math.isfinite(v) for v in (*center, *size))
        or any(v <= 0 for v in size)
    ):
        raise ValueError("Output bounds must be finite receptor coordinates and positive lengths.")
    tolerance = condition["tolerance_angstrom"]
    if not math.isfinite(tolerance) or not 0 <= tolerance <= 0.1:
        raise ValueError("Output-check tolerance is outside its declared angstrom bounds.")
    violations = []
    for index, position in points:
        excess = tuple(
            max(0.0, abs(v - c) - s / 2 - tolerance)
            for v, c, s in zip(position, center, size, strict=True)
        )
        if any(v > 0 for v in excess):
            violations.append({"output_atom_index": index, "position": position, "excess": excess})
    maximum = max((max(v["excess"]) for v in violations), default=0.0)
    return {
        "condition_id": condition["id"],
        "validator": "rdkit_receptor_bounds_v1",
        "selection": selection,
        "strength": condition["strength"],
        "weight": condition["weight"],
        "unit": "angstrom",
        "passed": not violations,
        "checked_points": len(points),
        "tolerance_angstrom": tolerance,
        "violations": violations,
        "maximum_excess": maximum,
        "weighted_deviation": maximum * condition["weight"]
        if condition["strength"] == "soft"
        else None,
    }


def verify_poses(supplier, poses, execution):
    conditions = (
        [c for c in execution["document"]["conditions"] if c["kind"] == "spatial_bounds"]
        if execution
        else []
    )
    for pose in poses:
        checks = []
        if pose["valid"]:
            checks = [assess(supplier[pose["record"]], condition) for condition in conditions]
            if any(c["strength"] == "hard" and not c["passed"] for c in checks):
                pose.update(
                    valid=False,
                    reason=(
                        "Failed explicit output spatial bounds; "
                        "raw native coordinates are retained for diagnosis."
                    ),
                )
        pose["constraint_checks"] = checks
    return poses
