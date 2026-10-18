"""Restore source component names after a PDB-only native calculation, without moving atoms."""

import json
import math
import re
from pathlib import Path

from receptor_native_io import pdb_residues, write_model


def _alias_heavy_atoms(model, aliases):
    result = {}
    for residue in pdb_residues(model):
        if residue.resname not in aliases:
            continue
        for atom in residue.get_atoms():
            if atom.element in {"H", "D"}:
                continue
            key = (residue.parent.id, residue.id, residue.resname, atom.name)
            if key in result:
                raise ValueError("Mapped ligand atom correspondence is ambiguous.")
            result[key] = tuple(float(v) for v in atom.coord)
    return result


def restored_packed_components(packed, transported_input, reference):
    packed, transported_input = Path(packed), Path(transported_input)
    receipt = transported_input.with_name(transported_input.stem + "-component-identifiers.json")
    if not receipt.exists():
        return packed
    if receipt.is_symlink() or receipt.stat().st_size > 1024**2:
        raise ValueError("The native component translation receipt is unsafe.")
    translation = json.loads(receipt.read_text())
    if translation.get("schema_version") != 1 or translation.get("source") != reference:
        raise ValueError("Packed component translation does not belong to the exact source.")
    aliases = translation.get("component_aliases")
    if (
        not isinstance(aliases, dict)
        or not aliases
        or any(
            not isinstance(original, str)
            or not re.fullmatch(r"[A-Za-z0-9_.+-]{4,32}", original)
            or not isinstance(alias, str)
            or not re.fullmatch(r"X[0-9A-Z]{2}", alias)
            for original, alias in aliases.items()
        )
        or len(set(aliases.values())) != len(aliases)
    ):
        raise ValueError("Native component translation is not a unique reviewed mapping.")
    if packed.is_symlink() or not packed.is_file() or packed.stat().st_size > 25 * 1024**2:
        raise ValueError("Packed component restoration requires a bounded regular PDB file.")
    from Bio.PDB import PDBParser

    structure = PDBParser(PERMISSIVE=False, QUIET=True).get_structure("packed", str(packed))
    models = list(structure.get_models())
    if len(models) != 1:
        raise ValueError("Packed component restoration requires one explicit structural model.")
    transported = PDBParser(PERMISSIVE=False, QUIET=True).get_structure(
        "transported", str(transported_input)
    )
    if len(transported) != 1:
        raise ValueError("Component translation requires one transported structural model.")
    expected = _alias_heavy_atoms(next(transported.get_models()), set(aliases.values()))
    actual = _alias_heavy_atoms(models[0], set(aliases.values()))
    if not expected or expected.keys() != actual.keys():
        raise ValueError("The native packed structure changed mapped ligand heavy-atom identity.")
    if any(math.dist(expected[key], actual[key]) > 0.002 for key in expected):
        raise ValueError("The native packed structure moved the fixed reference ligand.")
    model, reverse, observed = (
        models[0],
        {alias: original for original, alias in aliases.items()},
        set(),
    )
    for residue in pdb_residues(model):
        if residue.resname in reverse:
            if not residue.id[0].startswith("H_"):
                raise ValueError("A native component alias cannot replace a polymer residue.")
            observed.add(residue.resname)
            original = reverse[residue.resname]
            residue.resname = original
            residue.id = ("H_" + original, *residue.id[1:])
    if observed != set(reverse):
        raise ValueError("The native packed structure lost a mapped ligand; review its raw output.")
    if any(not all(math.isfinite(float(v)) for v in atom.coord) for atom in model.get_atoms()):
        raise ValueError("Native packed coordinates must remain finite.")
    target = packed.with_suffix(".cif")
    if target.exists():
        raise ValueError("Never overwrite an existing native packed artifact during translation.")
    write_model(model, target, preserve_atom_numbers=True)
    return target
