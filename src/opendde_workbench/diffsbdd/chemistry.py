"""Native chemistry calls inside the isolated Python 3.10 environment.

This module owns no queue, database, web server or design store. Atom indices denote
RDKit heavy-atom order within a single immutable SDF record, never viewer arrays.
"""

import hashlib
import io
import json


def bound_file(ref, bindings, directory, suffix):
    relative = bindings[str(ref["asset_id"])]
    if not relative.startswith("/job/assets/"):
        raise ValueError("Input binding is outside the task snapshot.")
    root = (directory / "assets").resolve()
    path = directory / relative.removeprefix("/job/")
    if path.is_symlink() or not path.resolve().is_relative_to(root) or path.suffix != suffix:
        raise ValueError("Scientific input escapes its snapshot or has the wrong format.")
    if path.stat().st_size > 25 * 1024**2:
        raise ValueError("Scientific input exceeds the size limit.")
    if hashlib.sha256(path.read_bytes()).hexdigest() != ref["sha256"]:
        raise ValueError("Scientific input digest changed after selection.")
    return path


def molecule(ref, bindings, directory, require_3d=True):
    import numpy as np
    from rdkit import Chem

    path = bound_file(ref, bindings, directory, ".sdf")
    supplier = Chem.SDMolSupplier(str(path), removeHs=True)
    record = ref.get("record", 0)
    if not 0 <= record < len(supplier) or supplier[record] is None:
        raise ValueError("Selected SDF record is missing or chemically invalid.")
    mol = supplier[record]
    if ref.get("conformer", 0) != 0 or not 1 <= mol.GetNumHeavyAtoms() <= 5000:
        raise ValueError("Unsupported conformer or molecular size.")
    if require_3d and (
        mol.GetNumConformers() != 1
        or not mol.GetConformer().Is3D()
        or not np.isfinite(mol.GetConformer().GetPositions()).all()
    ):
        raise ValueError(
            "Choose a valid three-dimensional molecular record aligned with the protein."
        )
    return mol


def sdf(mol):
    from rdkit import Chem

    stream = io.StringIO()
    writer = Chem.SDWriter(stream)
    writer.write(mol)
    writer.close()
    return stream.getvalue()


def generation_input(payload, bindings, directory):
    from local_diffsbdd.contracts import GenerationInput

    protein = bound_file(payload["protein"], bindings, directory, ".pdb").read_text()
    options = dict(payload["options"])
    pocket = payload["pocket"]
    fields = {}
    if pocket["kind"] == "ligand":
        fields["reference_sdf"] = sdf(molecule(pocket["ligand"], bindings, directory))
    elif pocket["kind"] == "bound_ligand":
        ref = pocket["residue"]
        fields["reference"] = f"{ref['chain']}:{ref['number']}"
    else:
        fields["residues"] = [f"{ref['chain']}:{ref['number']}" for ref in pocket["residues"]]
    if payload.get("initial"):
        mol = molecule(payload["initial"], bindings, directory)
        fixed = options.get("fixed_atoms", [])
        if fixed and max(fixed) >= mol.GetNumAtoms():
            raise ValueError("A selected fixed atom no longer exists in this molecule version.")
        fields["initial_sdf"] = sdf(mol)
    # Inspecting a pocket precedes selection of a fixed fragment; native inspection still
    # receives a fully valid generate contract instead of invalid inpainting parameters.
    if payload["mode"] == "pocket":
        options.update(task="generate", fixed_atoms=[], trajectory=False)
    return GenerationInput(mode="custom", protein_text=protein, options=options, **fields)


def inspect_pocket(payload, bindings, directory, output):
    from local_diffsbdd.pockets import preview_pocket

    result = preview_pocket(generation_input(payload, bindings, directory), None)
    (output / "protein.pdb").write_text(result.pop("protein"))
    (output / "pocket.pdb").write_text(result.pop("pocket"))
    result["protein_artifact"] = "protein.pdb"
    result["pocket_artifact"] = "pocket.pdb"
    if result.get("initial"):
        (output / "initial.sdf").write_text(result.pop("initial") + "\n$$$$\n")
        result["initial_artifact"] = "initial.sdf"
    if result.get("reference"):
        extension = "sdf" if result.get("reference_format") == "sdf" else "pdb"
        text = result.pop("reference")
        (output / ("reference." + extension)).write_text(text)
        result["reference_artifact"] = "reference." + extension
    return result


def prepare(payload, bindings, directory, output):
    from local_diffsbdd.preparation import PreparationInput, prepare_structure

    fields = {
        key: payload[key] for key in ("chains", "remove_water", "keep_ligands", "remove_hydrogens")
    }
    fields["protein_text"] = bound_file(payload["protein"], bindings, directory, ".pdb").read_text()
    result = prepare_structure(PreparationInput(**fields))
    (output / "prepared.pdb").write_text(result.pop("protein"))
    result["structure"] = "prepared.pdb"
    result["notes"] = (
        "Coordinates are preserved; filtering does not repair missing atoms "
        "or optimize the protein."
    )
    return result


def edit(payload, bindings, directory, output):
    from local_diffsbdd.editing import aligned_edit

    mol, alignment = aligned_edit(
        payload["molblock"], molecule(payload["original"], bindings, directory)
    )
    (output / "edited.sdf").write_text(sdf(mol))
    return {
        "molecule_artifact": "edited.sdf",
        "alignment": alignment,
        "parent": payload["original"],
        "notes": payload["notes"],
        "rating": payload["rating"],
        "notes_scientific": "Edited conformer with core alignment, not a predicted binding pose. "
        "Previous fixed atom selections are invalidated.",
    }


def interactions(payload, bindings, directory, output):
    from local_diffsbdd.interactions import InteractionInput, inspect_interactions

    result = inspect_interactions(
        InteractionInput(
            protein_text=bound_file(payload["protein"], bindings, directory, ".pdb").read_text(),
            sdf=sdf(molecule(payload["molecule"], bindings, directory)),
        )
    )
    # Atom and residue detections retain their immutable scientific context and method.
    for interaction in result["interactions"]:
        interaction["atom_refs"] = [
            {"molecule": payload["molecule"], "index": index}
            for index in interaction["ligand_atoms"]
        ]
        residue = interaction["residue"]
        residue.update(
            structure=payload["protein"], model=0, insertion_code="", alternate_location=""
        )
    (output / "interactions.json").write_text(
        json.dumps(result, ensure_ascii=False, allow_nan=False)
    )
    return result


def molecular_collection(payload, bindings, directory, output):
    from rdkit import Chem, rdBase
    from rdkit.Chem import QED, Crippen, Descriptors, Lipinski
    from rdkit.Contrib.SA_Score.sascorer import calculateScore

    records, unique = [], set()
    with Chem.SDWriter(str(output / "selected.sdf")) as writer:
        for ref in payload["molecules"]:
            try:
                mol = molecule(ref, bindings, directory, require_3d=False)
                smiles = Chem.MolToSmiles(mol)
                duplicate = smiles in unique
                unique.add(smiles)
                writer.write(mol)
                records.append(
                    {
                        "reference": ref,
                        "available": True,
                        "input": str(ref["asset_id"]),
                        "smiles": smiles,
                        "duplicate": duplicate,
                        "fragments": len(Chem.GetMolFrags(mol)),
                        "mw": Descriptors.MolWt(mol),
                        "logp": Crippen.MolLogP(mol),
                        "tpsa": Descriptors.TPSA(mol),
                        "qed": QED.qed(mol),
                        "sa": calculateScore(mol),
                        "hbd": Lipinski.NumHDonors(mol),
                        "hba": Lipinski.NumHAcceptors(mol),
                        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),
                    }
                )
            except ValueError as exc:
                records.append({"reference": ref, "available": False, "reason": str(exc)})
    if payload["mode"] == "export" and any(not r["available"] for r in records):
        raise ValueError(
            "Some selected molecular records are invalid; inspect properties before export."
        )
    return {
        "molecules": records,
        "unique_count": len(unique),
        "engine": "RDKit " + rdBase.rdkitVersion,
        "artifact": "selected.sdf",
        "notes": "Calculated descriptors, not ADMET or binding activity.",
    }


def inspect_identity(payload, bindings, directory, output):
    """Canonical atom order is the exact RDKit order used by generation_input."""
    from rdkit import rdBase

    mol = molecule(payload["molecule"], bindings, directory)
    artifact = "selection.sdf"
    (output / artifact).write_text(sdf(mol))
    return {
        "molecule_artifact": artifact,
        "reference": payload["molecule"],
        "atoms": [
            {
                "index": atom.GetIdx(),
                "element": atom.GetSymbol(),
                "selectable": atom.GetAtomicNum() > 1,
            }
            for atom in mol.GetAtoms()
        ],
        "identity_basis": "rdkit_removeHs_record_order",
        "engine": "RDKit " + rdBase.rdkitVersion,
        "notes": "Atom identity for this exact input version. Not a binding-pose validation.",
    }
