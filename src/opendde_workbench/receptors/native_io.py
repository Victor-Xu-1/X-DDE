"""Native-only bounded structural snapshots and selected-model exports."""

import hashlib
import math
import re
import warnings


def input_file(ref, bindings, directory):
    value = bindings[str(ref["asset_id"])]
    if not isinstance(value, str) or not value.startswith("/job/assets/"):
        raise ValueError("Structural input binding escapes its managed snapshot.")
    root = directory / "assets"
    file = directory / value.removeprefix("/job/")
    if (
        file.is_symlink()
        or not file.resolve().is_relative_to(root.resolve())
        or file.suffix not in {".pdb", ".cif"}
        or file.stat().st_size > 25 * 1024**2
    ):
        raise ValueError("Choose a bounded PDB/mmCIF input within the task snapshot.")
    if hashlib.sha256(file.read_bytes()).hexdigest() != ref["sha256"]:
        raise ValueError("Structural source bytes differ from the selected immutable version.")
    if ref.get("record", 0) != 0 or ref.get("conformer", 0) != 0:
        raise ValueError("Select structural models through model_index.")
    return file


def read_model(file, selection):
    from Bio.PDB import MMCIFParser, PDBParser

    parser = (
        PDBParser(PERMISSIVE=False, QUIET=False)
        if file.suffix == ".pdb"
        else MMCIFParser(QUIET=False, auth_chains=True, auth_residues=True)
    )
    with warnings.catch_warnings(record=True) as messages:
        warnings.simplefilter("always")
        structure = parser.get_structure("source", str(file))
    models = list(structure.get_models())
    if not 1 <= len(models) <= 100 or selection.model_index >= len(models):
        raise ValueError("Selected structural model is missing or exceeds the model limit.")
    model = models[selection.model_index].copy()
    available = {chain.id for chain in model.get_chains()}
    selected = set(selection.chains) if selection.chains else available
    if not selected <= available or not selected or len(selected) > 16:
        raise ValueError("Selected chains do not belong to this exact structural model.")
    if any(not c or len(c) > 8 or any(ord(x) < 32 or ord(x) == 127 for x in c) for c in selected):
        raise ValueError("Structural chain identities exceed the supported namespace.")
    for chain in list(model.get_chains()):
        if chain.id not in selected:
            model.detach_child(chain.id)
    # Never silently choose one occupancy or relative alternate state.
    if any(r.is_disordered() == 2 for r in model.get_residues()) or any(
        a.is_disordered() or a.get_altloc().strip() for a in model.get_atoms()
    ):
        raise ValueError(
            "Resolve alternate residue/atom locations before constructing an ensemble."
        )
    atoms = list(model.get_atoms())
    if not 3 <= len(atoms) <= 100000:
        raise ValueError("Selected structural model requires 3 to 100000 atoms.")
    import numpy as np

    if not np.isfinite(np.array([a.coord for a in atoms], dtype=float)).all():
        raise ValueError("Structural coordinates must be finite.")
    return model, {
        "source_format": "pdb" if file.suffix == ".pdb" else "mmcif",
        "source_model_count": len(models),
        "selected_model_index": selection.model_index,
        "selected_chains": sorted(selected),
        "parser_warnings": [str(w.message)[:300] for w in messages[:20]],
        "parser_warnings_truncated": len(messages) > 20,
    }


def pdb_residues(model):
    for chain in model:
        yield from chain.get_unpacked_list()


def validate_pdb_format(model, *, preserve_atom_numbers=False):
    if any(not re.fullmatch(r"[A-Za-z0-9 ]", chain.id) for chain in model):
        raise ValueError("Prepare single-character author chain identifiers before PDB conversion.")
    serials, count = set(), 0
    for residue in pdb_residues(model):
        if not 1 <= len(residue.resname) <= 3:
            raise ValueError("PDB cannot preserve these residue identifiers; choose mmCIF.")
        if not -999 <= residue.id[1] <= 9999 or not re.fullmatch(r"[A-Za-z0-9 ]", residue.id[2]):
            raise ValueError("Residue identifiers exceed native PDB fixed columns; choose mmCIF.")
        for atom in residue.get_unpacked_list():
            count += 1
            if not 1 <= len(atom.id) <= 4 or any(not 33 <= ord(c) <= 126 for c in atom.id):
                raise ValueError("PDB cannot preserve these atom identifiers; choose mmCIF.")
            if not all(
                math.isfinite(float(v)) and len(f"{float(v):8.3f}") == 8 for v in atom.coord
            ):
                raise ValueError("Coordinates exceed native PDB fixed columns; choose mmCIF.")
            if preserve_atom_numbers:
                serial = atom.get_serial_number()
                if not isinstance(serial, int) or not 1 <= serial <= 99999 or serial in serials:
                    raise ValueError(
                        "Native PDB requires unique representable source atom numbers."
                    )
                serials.add(serial)
    if not 1 <= count <= 99999:
        raise ValueError("Choose a nonempty structural selection within the native PDB atom limit.")


def write_model(model, file, *, preserve_atom_numbers=False):
    from Bio.PDB import MMCIFIO, PDBIO

    if file.suffix == ".pdb":
        validate_pdb_format(model, preserve_atom_numbers=preserve_atom_numbers)
    exporter = PDBIO() if file.suffix == ".pdb" else MMCIFIO()
    # The new artifact contains exactly one selected model; the original stays immutable.
    model.id = 0
    model.serial_num = 1
    exporter.set_structure(model)
    exporter.save(str(file), preserve_atom_numbering=preserve_atom_numbers)
    if not file.is_file() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Aligned structural artifact exceeds its bounded format contract.")
    return hashlib.sha256(file.read_bytes()).hexdigest()
