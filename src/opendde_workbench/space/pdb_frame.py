"""Explicit proper rigid computational frame; original scientific assets are untouched."""

import math


def dot(left, right):
    return sum(a * b for a, b in zip(left, right, strict=True))


def subtract(left, right):
    return [a - b for a, b in zip(left, right, strict=True)]


def cross(left, right):
    a, b, c = left
    x, y, z = right
    return [b * z - c * y, c * x - a * z, a * y - b * x]


def unit(vector):
    norm = math.sqrt(dot(vector, vector))
    if norm < 1e-6:
        raise ValueError("A stable computational frame requires a non-collinear backbone.")
    return [value / norm for value in vector]


def valid_origin(origin):
    if len(origin) != 3 or any(
        isinstance(v, bool)
        or not isinstance(v, (float, int))
        or not math.isfinite(v)
        or abs(v) > 100000
        for v in origin
    ):
        raise ValueError("The computational source point is invalid or outside the bounded frame.")
    return [float(v) for v in origin]


def source_position(position, frame):
    return [
        frame["origin"][index]
        + sum(value * axis[index] for value, axis in zip(position, frame["basis"], strict=True))
        for index in range(3)
    ]


def canonical_pdb(data, origin):
    origin = valid_origin(origin)
    if len(data) > 25 * 1024**2:
        raise ValueError("Native structural input exceeds 25 MiB.")
    lines = data.decode("ascii").splitlines()
    atoms, residues = [], {}
    for index, line in enumerate(lines):
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        if len(line) < 54:
            raise ValueError("Native PDB atom coordinates are incomplete.")
        position = [float(line[start : start + 8]) for start in (30, 38, 46)]
        if not all(math.isfinite(v) for v in position):
            raise ValueError("Native PDB positions must be finite.")
        atoms.append((index, position))
        if len(atoms) > 15000:
            raise ValueError("Native CAVER is bounded to 15000 obstacle atoms.")
        if line.startswith("ATOM  ") and line[12:16].strip() in {"N", "CA", "C"}:
            key = (line[21], int(line[22:26]), line[26], line[17:20].strip())
            residues.setdefault(key, {}).setdefault(line[12:16].strip(), []).append(position)
    complete = [
        (key, row)
        for key, row in sorted(residues.items())
        if set(row) == {"N", "CA", "C"} and all(len(v) == 1 for v in row.values())
    ]
    if not complete:
        raise ValueError("Provide a protein with one complete unambiguous N/CA/C backbone residue.")
    key, anchor = complete[0]
    x = unit(subtract(anchor["C"][0], anchor["CA"][0]))
    other = subtract(anchor["N"][0], anchor["CA"][0])
    y = unit([v - dot(other, x) * axis for v, axis in zip(other, x, strict=True)])
    z = cross(x, y)
    frame = {
        "method": "source_point_and_first_complete_backbone_proper_rigid_frame",
        "origin": origin,
        "basis": [x, y, z],
        "context_anchor": {
            "chain": key[0],
            "number": key[1],
            "insertion_code": key[2].strip(),
            "resname": key[3],
            "atoms": ["N", "CA", "C"],
        },
        "coordinate_unit": "angstrom",
        "maximum_rounding_error_angstrom": math.sqrt(3) * 0.0005,
    }
    error = 0.0
    for index, position in atoms:
        local = [dot(axis, subtract(position, origin)) for axis in frame["basis"]]
        fields = [f"{value:8.3f}" for value in local]
        fields = [f"{0.0:8.3f}" if float(field) == 0 else field for field in fields]
        if any(len(field) != 8 for field in fields):
            raise ValueError("The computational context cannot be represented faithfully as PDB.")
        rounded = [float(field) for field in fields]
        error = max(error, math.dist(source_position(rounded, frame), position))
        line = lines[index]
        lines[index] = line[:30] + "".join(fields) + line[54:]
    if error > frame["maximum_rounding_error_angstrom"] + 1e-9:
        raise ValueError("Computational PDB export exceeded its declared coordinate error.")
    frame["observed_rounding_error_angstrom"] = error
    # CAVER consumes molecular obstacle coordinates, without crystal/assembly or
    # anisotropic tensors. Retain atom identities/connectivity, and leave all
    # original-frame metadata in the immutable source rather than mislabel it.
    native = (
        "\n".join(
            line
            for line in lines
            if line.startswith(("ATOM  ", "HETATM", "CONECT", "TER   ", "END"))
        )
        + "\n"
    )
    return native.encode("ascii"), frame


def source_channels(rows, frame):
    """Apply only the stored inverse rigid transform to native geometry, never to source files."""
    return [
        {
            **row,
            "points": [
                {**point, "position": source_position(point["position"], frame)}
                for point in row["points"]
            ],
        }
        for row in rows
    ]
