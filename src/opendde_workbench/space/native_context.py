"""Native-only observed atom context, with explicit removal and lossless identity mapping."""

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

from manifest import RADII_SHA256
from native_io import read_model
from structural_profile import profile

WATER = {"HOH", "WAT", "DOD"}


def identity(chain, residue):
    return {
        "chain": chain.id,
        "number": residue.id[1],
        "insertion_code": residue.id[2].strip(),
        "resname": residue.resname,
    }


def prepare_context(file, regions, options, output):
    from Bio.Data.PDBData import nucleic_letters_3to1_extended, protein_letters_3to1_extended
    from Bio.PDB import PDBIO
    from Bio.PDB.Chain import Chain
    from Bio.PDB.Model import Model
    from Bio.PDB.Residue import Residue

    protected_names = {
        name.strip().upper()
        for name in (*protein_letters_3to1_extended, *nucleic_letters_3to1_extended)
    }
    model, source = read_model(
        file, SimpleNamespace(model_index=options.model_index, chains=options.context_chains)
    )
    _, quality = profile(model)
    matches, center_atoms, removed = [], [], []
    for selected in regions:
        candidates = [
            (chain, residue)
            for chain in model
            for residue in chain
            if identity(chain, residue) == selected
        ]
        if len(candidates) != 1:
            raise ValueError("A starting component is missing or ambiguous in the selected model.")
        chain, residue = candidates[0]
        atoms = [atom for atom in residue if atom.element.strip().upper() not in {"H", "D"}]
        if not atoms or len(center_atoms) + len(atoms) > 500:
            raise ValueError("Choose a starting region containing 1–500 observed heavy atoms.")
        center_atoms.extend(atoms)
        matches.append(identity(chain, residue))
        if options.remove_starting_ligands and residue.id[0].startswith("H_"):
            if residue.resname.upper() in protected_names or {"N", "CA", "C"} <= {
                a.id for a in residue
            }:
                continue  # These components are protected polymers, not removable ligands.
            removed.append((chain.id, residue.id))
    origin = [
        sum(round(float(atom.coord[index]), 3) for atom in center_atoms) / len(center_atoms)
        for index in range(3)
    ]
    # Read the actual native radius table; its unknown/no-data fallback is never permitted.
    radii_file = Path("/opt/caver/bin/atom_radii.csv")
    if hashlib.sha256(radii_file.read_bytes()).hexdigest() != RADII_SHA256:
        raise ValueError("Native radius definitions differ from the reviewed archive.")
    radii = {}
    for line in radii_file.read_text().splitlines()[1:]:
        if not line.strip():
            continue
        parts = line.split(";")
        if len(parts) == 4 and parts[3].strip().isdigit() and int(parts[0]) > 0:
            radii[parts[1].upper()] = int(parts[3]) / 100
    context, mapping, count = Model(0), [], 0
    for chain_index, chain in enumerate(sorted(model, key=lambda c: c.id)):
        native_chain = Chain(chr(ord("A") + chain_index))
        context.add(native_chain)
        residues = sorted(chain, key=lambda r: (r.id[1], r.id[2], r.resname, r.id[0]))
        ordinal = 0
        for residue in residues:
            if residue.resname in WATER or (chain.id, residue.id) in removed:
                continue
            atoms = [a for a in residue if a.element.strip().upper() not in {"H", "D"}]
            if not atoms:
                continue
            ordinal += 1
            if ordinal > 9999:
                raise ValueError("The selected chain exceeds the native residue namespace.")
            label = residue.resname if len(residue.resname) <= 3 else "UNK"
            native_residue = Residue((residue.id[0], ordinal, " "), label, residue.segid)
            native_chain.add(native_residue)
            for atom_index, atom in enumerate(sorted(atoms, key=lambda a: a.id)):
                element = atom.element.strip().upper()
                if element not in radii:
                    raise ValueError(
                        "Native van der Waals radius is undefined for element " + element + "."
                    )
                count += 1
                if count > 15000:
                    raise ValueError("Native channel analysis is bounded to 15000 obstacle atoms.")
                clone = atom.copy()
                name = atom.id
                if len(name) > 4 or any(ord(c) > 126 or ord(c) < 32 for c in name):
                    name = element[0] + str(atom_index + 1)
                    if len(name) > 4:
                        raise ValueError(
                            "This atom identity cannot be mapped to the native PDB namespace."
                        )
                    clone.id = clone.name = name
                    clone.fullname = name.rjust(4)
                clone.set_serial_number(count)
                native_residue.add(clone)
                mapping.append(
                    {
                        "native_serial": count,
                        "source_residue": identity(chain, residue),
                        "source_atom": atom.id,
                        "source_element": element,
                        "source_position": [float(v) for v in atom.coord],
                        "native_radius_angstrom": radii[element],
                    }
                )
        if not native_chain.child_list:
            context.detach_child(native_chain.id)
    if count < 20:
        raise ValueError("The selected protein obstacle context is too small.")
    raw = output / "context-source.pdb"
    writer = PDBIO()
    writer.set_structure(context)
    writer.save(str(raw), preserve_atom_numbering=True)
    map_file = output / "context-map.json"
    map_file.write_text(
        json.dumps(
            {
                "source": source,
                "quality": quality,
                "atoms": mapping,
                "starting_regions": matches,
                "removed_starting_ligands": [
                    identity(model[chain], model[chain][residue]) for chain, residue in removed
                ],
                "water_policy": "omit_HOH_WAT_DOD",
                "hydrogen_policy": "observed_heavy_atoms_only",
                "radius_table_sha256": hashlib.sha256(radii_file.read_bytes()).hexdigest(),
                "source_point": origin,
                "source_point_precision": "equal_weight_heavy_atoms_at_PDB_export_precision",
                "starting_atoms": [
                    {
                        "source_position": [round(float(v), 3) for v in atom.coord],
                        "source_atom": atom.id,
                        "source_residue": identity(
                            atom.get_parent().get_parent(), atom.get_parent()
                        ),
                        "source_element": atom.element,
                    }
                    for atom in center_atoms
                ],
            },
            allow_nan=False,
        )
    )
    return (
        raw,
        origin,
        {
            "source": source,
            "quality": quality,
            "obstacle_atoms": count,
            "source_point": origin,
            "removed_starting_ligand_count": len(removed),
            "radius_table_sha256": hashlib.sha256(radii_file.read_bytes()).hexdigest(),
        },
    )
