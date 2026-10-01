"""Keep invalid raw records visible; model representations do not alter source files."""

import hashlib
import re

from manifest import MAX_HEAVY_ATOMS, MAX_INPUT_BYTES, MAX_RECORDS
from sdf_io import read_records, split_records


def inputs(request, bindings, directory):
    from rdkit import Chem

    source = request.get("molecule") or request["library"]
    path = directory / bindings[str(source["asset_id"])].removeprefix("/job/")
    if (
        path.is_symlink()
        or path.suffix != ".sdf"
        or path.stat().st_size > MAX_INPUT_BYTES
        or not path.resolve().is_relative_to((directory / "assets").resolve())
    ):
        raise ValueError("ADMET input escapes its exact bounded snapshot.")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("The selected ADMET input bytes changed.")
    blocks = split_records(raw)
    if request.get("molecule"):
        selected = request["molecule"]["record"]
        if not 0 <= selected < len(blocks):
            raise ValueError("The exact selected molecular record is missing.")
        indices = [selected]
    else:
        if len(blocks) > MAX_RECORDS:
            raise ValueError(
                "Split this SDF into files of at most 50 records, including invalid records."
            )
        indices = list(range(len(blocks)))
    molecules = {index: read_records(blocks[index] + b"\n$$$$\n")[0] for index in indices}
    rows, unique = [], {}
    for index in indices:
        mol = molecules[index]
        row = {
            "record": index,
            "source_record_sha256": hashlib.sha256(blocks[index]).hexdigest(),
            "name": f"Record {index + 1}",
            "smiles": None,
            "duplicate_of_record": None,
            "status": "failed",
            "reason": None,
            "predictions": {},
        }
        if mol is None:
            row["reason"] = "invalid_sdf_record"
        elif not 1 <= mol.GetNumHeavyAtoms() <= MAX_HEAVY_ATOMS:
            row["reason"] = "heavy_atom_limit"
        elif len(Chem.GetMolFrags(mol)) != 1:
            row["reason"] = "disconnected_components_require_preparation"
        else:
            name = mol.GetProp("_Name") if mol.HasProp("_Name") else row["name"]
            row["name"] = re.sub(r"[\x00-\x1f\x7f]", " ", name).strip()[:120] or row["name"]
            smile = Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True)
            if not smile or len(smile) > 5000:
                row["reason"] = "unsupported_model_representation"
            else:
                row["smiles"] = smile
                row["duplicate_of_record"] = unique.get(smile)
                unique.setdefault(smile, index)
                row["status"] = "pending"
        rows.append(row)
    return source, rows, list(unique), blocks
