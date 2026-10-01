"""Native input checks retain chemical identity, coordinates and raw record numbering."""

import hashlib
import math


def bound(ref, bindings, root, suffix):
    path = root / bindings[str(ref["asset_id"])].removeprefix("/job/")
    if (
        path.is_symlink()
        or not path.resolve().is_relative_to((root / "assets").resolve())
        or path.suffix != suffix
        or path.stat().st_size > 25 * 1024**2
    ):
        raise ValueError("Quality input escapes its exact bounded snapshot.")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref["sha256"]:
        raise ValueError("Selected quality input digest changed.")
    return path, raw


def molecule(raw, record):
    from sdf_io import read_records

    molecules = read_records(raw)
    if not 0 <= record < len(molecules) or molecules[record] is None:
        raise ValueError("The selected original SDF record is chemically invalid or missing.")
    mol = molecules[record]
    if (
        not 1 <= mol.GetNumHeavyAtoms() <= 256
        or mol.GetNumConformers() != 1
        or not mol.GetConformer().Is3D()
    ):
        raise ValueError(
            "Select a three-dimensional molecule with1–256 heavy atoms and one conformer."
        )
    if not all(math.isfinite(value) for row in mol.GetConformer().GetPositions() for value in row):
        raise ValueError("Selected molecule coordinates are not finite.")
    return mol


def receptor(raw):
    lines = raw.decode("ascii", errors="strict").splitlines()
    if sum(line.startswith("MODEL ") for line in lines) > 1:
        raise ValueError("Use Structure preparation to select one receptor model.")
    atoms = [line for line in lines if line.startswith(("ATOM  ", "HETATM"))]
    if not atoms or len(atoms) > 100000 or not any(line.startswith("ATOM  ") for line in atoms):
        raise ValueError("Use a bounded receptor with observed protein atoms.")
    identities = set()
    for line in atoms:
        if len(line) < 54 or line[16].strip():
            raise ValueError("Use Structure preparation to resolve alternate atom locations.")
        key = (line[21:27], line[12:16])
        if key in identities:
            raise ValueError("Receptor atom identity is ambiguous; prepare one explicit model.")
        identities.add(key)
        if not all(math.isfinite(float(line[start : start + 8])) for start in (30, 38, 46)):
            raise ValueError("Receptor coordinates are not finite.")
