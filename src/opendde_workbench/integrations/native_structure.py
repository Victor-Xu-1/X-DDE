"""PDB transport with explicit format bounds and reversible component identifiers."""

import itertools
import json
import re
from pathlib import Path

from native_io import input_file
from receptor_native_io import pdb_residues, validate_pdb_format, write_model

OUTPUT = Path("/output/native-inputs")


def component_aliases(model, allow_aliases):
    residues = list(pdb_residues(model))
    occupied = {residue.resname for residue in residues}
    polymers = {residue.resname for residue in residues if not residue.id[0].startswith("H_")}
    aliases = {}
    available = (
        "X" + "".join(pair)
        for pair in itertools.product("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", repeat=2)
        if "X" + "".join(pair) not in occupied
    )
    for name in sorted(occupied):
        if not re.fullmatch(r"[A-Za-z0-9_.+-]{1,32}", name):
            raise ValueError("The component identifier cannot be represented safely in PDB.")
        if len(name) <= 3:
            continue
        if not allow_aliases:
            raise ValueError(
                "This PDB-only calculation requires a reviewed component-identifier translation."
            )
        if name in polymers:
            raise ValueError("Prepare a supported modified-polymer residue before PDB conversion.")
        alias = next(available, None)
        if alias is None:
            raise ValueError("The bounded PDB component-identifier translation is exhausted.")
        aliases[name] = alias
    return aliases


def input_pdb(request, role="structure", *, allow_component_aliases=False):
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", role):
        raise ValueError("Invalid native structural input role.")
    source, reference = input_file(request, role)
    if source.suffix == ".pdb":
        if sum(line.startswith("MODEL ") for line in source.read_text().splitlines()) > 1:
            raise ValueError("Select one structural model before this calculation.")
        return source, reference
    from Bio.PDB import MMCIFParser

    structure = MMCIFParser(QUIET=True).get_structure("input", source)
    models = list(structure.get_models())
    if len(models) != 1:
        raise ValueError("Select one structural model before this calculation.")
    aliases = component_aliases(models[0], allow_component_aliases)
    for residue in pdb_residues(models[0]):
        residue.resname = aliases.get(residue.resname, residue.resname)
    validate_pdb_format(models[0], preserve_atom_numbers=True)
    OUTPUT.mkdir(exist_ok=True)
    file = OUTPUT / (role + ".pdb")
    write_model(models[0], file, preserve_atom_numbers=True)
    if aliases:
        # This is a private execution receipt, outside the root research-artifact
        # list. The original scientific input is never renamed or rewritten.
        (OUTPUT / (role + "-component-identifiers.json")).write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "source": reference,
                    "component_aliases": aliases,
                    "coordinate_policy": "original_source_frame_with_PDB_decimal_precision",
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )
    return file, reference
