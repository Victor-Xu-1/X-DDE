"""Observed heavy-atom residue contacts; no hydrogen-bond or per-residue energy claims."""

import math
from dataclasses import dataclass


def address(value):
    return value["chain"], value["number"], value.get("insertion_code", "")


def address_value(key):
    return {"chain": key[0], "number": key[1], "insertion_code": key[2]}


@dataclass
class ProteinGeometry:
    coordinates: object
    residues: tuple
    ca: dict


def read_receptor(file):
    import numpy as np

    atoms, residues, ca, seen = [], [], {}, set()
    models = 0
    for line in file.read_text(encoding="ascii").splitlines():
        record = line[:6].strip()
        if record == "MODEL":
            models += 1
            if models > 1:
                raise ValueError("Receptor contact comparison accepts one explicit PDB model.")
        if record != "ATOM":
            continue
        if len(line) < 78:
            raise ValueError("Receptor atoms require explicit elements and PDB coordinates.")
        element = line[76:78].strip().upper()
        if not element or not element.isalpha():
            raise ValueError("Receptor contact atoms require explicit element symbols.")
        if element in {"H", "D", "T"}:
            continue
        residue = (line[21:22], int(line[22:26]), line[26:27].strip())
        atom = line[12:16].strip()
        identity = (*residue, atom)
        if identity in seen:
            raise ValueError(
                "Resolve alternate/duplicate receptor atoms before contact comparison."
            )
        seen.add(identity)
        xyz = tuple(float(line[start : start + 8]) for start in (30, 38, 46))
        if not all(math.isfinite(v) and abs(v) <= 100000 for v in xyz):
            raise ValueError("Receptor coordinates are nonfinite or outside the supported range.")
        atoms.append(xyz)
        residues.append(residue)
        if atom == "CA":
            ca[residue] = xyz
        if len(atoms) > 50000:
            raise ValueError("Receptor contact comparison exceeds 50000 heavy protein atoms.")
    if len(ca) < 3:
        raise ValueError("Receptor frame requires at least three observed C-alpha atoms.")
    return ProteinGeometry(np.asarray(atoms, dtype=float), tuple(residues), ca)


def verify_aligned_frame(protein, reference, pairs, expected):
    import numpy as np

    moving, target = [], []
    for pair in pairs:
        a, b = address(pair["moving"]), address(pair["reference"])
        if a not in protein.ca or b not in reference.ca:
            raise ValueError("An alignment anchor is absent from the exact receptor coordinates.")
        moving.append(protein.ca[a])
        target.append(reference.ca[b])
    # Coordinates have already been transformed by the upstream alignment task.
    # Applying that transform twice, or ligand-fitting here, would corrupt the frame.
    difference = np.asarray(moving) - np.asarray(target)
    observed = float(np.sqrt(np.mean(np.sum(difference * difference, axis=1))))
    if abs(observed - expected) > 0.01:
        raise ValueError(
            "Exported receptor coordinates do not reproduce their saved alignment RMSD."
        )
    return observed


def contacts(geometry, protein, pairs, cutoff):
    import numpy as np

    xyz = geometry.coordinates[list(geometry.heavy_indices)]
    mapping = {address(p["moving"]): address(p["reference"]) for p in pairs}
    distances = {}
    for start in range(0, len(protein.residues), 1024):
        difference = protein.coordinates[start : start + 1024, None, :] - xyz[None, :, :]
        nearest = np.sqrt(np.min(np.sum(difference * difference, axis=2), axis=1))
        for offset in np.flatnonzero(nearest <= cutoff):
            key, value = protein.residues[start + int(offset)], float(nearest[offset])
            distances[key] = min(distances.get(key, math.inf), value)
    ordered = sorted(distances, key=lambda key: (distances[key], key))
    fingerprint = frozenset(mapping[key] for key in ordered if key in mapping)
    coverage = len(fingerprint) / len(ordered) if ordered else None
    rows = [
        {
            "residue": address_value(key),
            "reference_residue": address_value(mapping[key]) if key in mapping else None,
            "distance_angstrom": distances[key],
        }
        for key in ordered
    ]
    return fingerprint, coverage, rows


def contact_similarity(left, right, minimum_mapping):
    a, ac, _ = left
    b, bc, _ = right
    if ac is None or bc is None or not a or not b:
        return None, "no_mapped_contacts"
    if min(ac, bc) < minimum_mapping:
        return None, "insufficient_residue_mapping"
    return len(a & b) / len(a | b), "mapped_geometric_residue_contacts"
