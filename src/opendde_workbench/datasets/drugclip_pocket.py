"""Observed protein atoms around a confirmed ligand or center; exact receptor coordinates."""

import json
from pathlib import Path

import numpy as np
from platformnative_io import input_file


def pocket(request):
    from Bio.PDB import MMCIFParser, PDBParser, is_aa
    from rdkit import Chem
    from scipy.spatial import cKDTree

    source, reference = input_file(request, "structure")
    parser = MMCIFParser(QUIET=True) if source.suffix == ".cif" else PDBParser(QUIET=True)
    structure = parser.get_structure("target", str(source))
    models = list(structure.get_models())
    if len(models) != 1:
        raise ValueError("Choose a prepared single-model receptor for pocket screening.")
    options, region = request["payload"], request["payload"]["search"]
    if region["kind"] == "reference_ligand":
        file, ligand_ref = input_file(request, "ligand")
        supplier = Chem.SDMolSupplier(str(file), removeHs=False)
        molecule = supplier[ligand_ref["record"]] if ligand_ref["record"] < len(supplier) else None
        if (
            molecule is None
            or not molecule.GetNumConformers()
            or not molecule.GetConformer().Is3D()
        ):
            raise ValueError(
                "The confirmed reference ligand needs actual 3D receptor-frame coordinates."
            )
        reference_coordinates = molecule.GetConformer().GetPositions()[
            [atom.GetIdx() for atom in molecule.GetAtoms() if atom.GetAtomicNum() > 1]
        ]
    else:
        reference_coordinates = np.array([region["box"]["center"]], dtype=np.float32)
    if not len(reference_coordinates) or not np.isfinite(reference_coordinates).all():
        raise ValueError("The pocket-defining coordinates are invalid.")
    tree = cKDTree(reference_coordinates)
    atoms, coordinates, residues = [], [], []
    for chain in models[0]:
        for residue in chain:
            if not is_aa(residue, standard=False):
                continue
            observed = list(residue.get_atoms())
            if any(
                atom.is_disordered() and len(atom.disordered_get_list()) > 1 for atom in observed
            ):
                raise ValueError(
                    "Prepare an explicit alternate-location selection before screening."
                )
            heavy = [atom for atom in observed if atom.element.strip().upper() not in {"H", "D"}]
            if not heavy:
                continue
            positions = np.array([atom.coord for atom in heavy], dtype=np.float32)
            if not np.isfinite(positions).all():
                raise ValueError("The receptor contains nonfinite atomic coordinates.")
            distances = tree.query(positions)[0]
            if distances.min() > options["pocket_radius"]:
                continue
            atoms.extend(atom.element.strip().capitalize() for atom in heavy)
            coordinates.extend(positions.tolist())
            residues.append(
                {
                    "chain": chain.id,
                    "number": residue.id[1],
                    "insertion": residue.id[2].strip(),
                    "name": residue.resname,
                    "closest_distance": float(distances.min()),
                }
            )
    if not 4 <= len(atoms) <= 510:
        raise ValueError(
            "Choose a pocket containing 4–510 protein heavy atoms; adjust its radius or center."
        )
    evidence = {
        "receptor": reference,
        "search": region,
        "radius_angstrom": options["pocket_radius"],
        "residues": residues,
        "atoms": len(atoms),
        "policy": "whole_observed_amino_acid_residues_near_reference; no_waters_or_cofactors",
    }
    Path("/output/pocket.json").write_text(
        json.dumps(evidence, ensure_ascii=False), encoding="utf-8"
    )
    return atoms, np.asarray(coordinates, dtype=np.float32)
