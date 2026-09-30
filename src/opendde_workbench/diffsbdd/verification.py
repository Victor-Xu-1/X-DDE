"""Result qualification after native generation, separate from sampling acceptance."""

import hashlib
from pathlib import Path

from fixed_core import METHOD, assess
from stereo import chemical_stereo


def digest(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 25 * 1024**2:
        raise ValueError("Generation output is missing, unsafe or oversized.")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_inpaint(source, initial, fixed_atoms, preserve_bonds, native_file, output, expected):
    from rdkit import Chem

    raw_sha = digest(native_file)
    supplier = (
        Chem.SDMolSupplier(str(native_file), removeHs=True) if native_file.stat().st_size else []
    )
    if len(supplier) != expected or not 0 <= expected <= 100:
        raise ValueError("Native candidate count and actual molecular records disagree.")
    qualified = output / "qualified-molecules.sdf"
    rows = []
    count = 0
    with Chem.SDWriter(str(qualified)) as writer:
        for record, candidate in enumerate(supplier):
            if candidate is None:
                raise ValueError("Native accepted output contains an invalid molecule.")
            check = assess(source, candidate, fixed_atoms, preserve_bonds)
            # Keep raw native files intact. Canonical handoff records use the same
            # chemical stereo interpretation as the verifier; atom order is unchanged.
            candidate = chemical_stereo(candidate)
            row = {"record": record, "qualified_record": None, "diagnostic_artifact": None, **check}
            if check["status"] == "passed":
                row["qualified_record"] = count
                writer.write(candidate)
                count += 1
            else:
                name = f"diagnostic-core-{record + 1:03d}.sdf"
                with Chem.SDWriter(str(output / name)) as diagnostic:
                    diagnostic.write(candidate)
                row["diagnostic_artifact"] = name
            rows.append(row)
    return {
        "schema_version": 1,
        "method": METHOD,
        "source": initial,
        "fixed_atoms": fixed_atoms,
        "preserve_bonds": preserve_bonds,
        "raw_artifact": Path(native_file).relative_to(output).as_posix(),
        "raw_sha256": raw_sha,
        "qualified_artifact": qualified.name,
        "qualified_sha256": digest(qualified),
        "qualified_count": count,
        "candidates": rows,
    }
