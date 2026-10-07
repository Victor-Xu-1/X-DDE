"""Observed single-chain partner selection through the shared preparation policy."""

from pathlib import Path

import numpy as np
from Bio.PDB import PDBIO
from Bio.PDB.Polypeptide import is_aa
from native_io import input_file
from native_selection import read_selected, select_atoms
from preparation_options import PreparationOptions


def read_partner(request, role):
    source, reference = input_file(request, "partner_" + role)
    chain = request["payload"]["partner_" + role + "_chain"]
    options = PreparationOptions(
        model_index=0,
        chains=[chain],
        waters=False,
        heterogens="remove",
        alternate="A",
        format="pdb",
    )
    model, inspection = read_selected(source, options)
    atoms, removed, alternates = select_atoms(model, options)
    residues = list(model.get_residues())
    if not 30 <= len(residues) <= 1800:
        raise ValueError("Select a protein partner with 30–1800 observed residues.")
    if any(not is_aa(residue, standard=True) for residue in residues):
        raise ValueError("The reviewed ternary model requires standard observed protein residues.")
    if any(not {"N", "CA", "C"} <= set(residue.child_dict) for residue in residues):
        raise ValueError("Resolve missing observed backbone atoms before ternary modeling.")
    # The graph uses CA nodes; the rigid output transform must retain all observed heavy atoms.
    for residue in residues:
        for atom in list(residue):
            if atom.element in {"H", "D"}:
                residue.detach_child(atom.id)
    atoms = list(model.get_atoms())
    coordinates = np.asarray([atom.coord for atom in atoms], dtype=np.float64)
    if not np.isfinite(coordinates).all() or np.abs(coordinates).max() > 100000:
        raise ValueError("Protein partner coordinates exceed the reviewed coordinate range.")
    names = [
        {
            "position": [float(coordinate) for coordinate in atom.coord],
            "chain": atom.parent.parent.id,
            "number": atom.parent.id[1],
            "insertion": atom.parent.id[2].strip(),
            "residue": atom.parent.resname,
            "atom": atom.id,
            "element": atom.element,
        }
        for atom in atoms
    ]
    if len(
        {(item["chain"], item["number"], item["insertion"], item["atom"]) for item in names}
    ) != len(names):
        raise ValueError("Protein partner atom identities are ambiguous.")
    directory = Path("/output/native-inputs")
    directory.mkdir(exist_ok=True)
    file = directory / ("partner-" + role + ".pdb")
    writer = PDBIO()
    writer.set_structure(model)
    writer.save(str(file))
    return {
        "model": model,
        "file": file,
        "source": reference,
        "identities": names,
        "coordinates": coordinates,
        "inspection": inspection,
        "removed": removed,
        "alternates": alternates,
    }


def validate_bound_arm(arm, partner):
    from scipy.spatial import cKDTree

    distance, _ = cKDTree(partner["coordinates"]).query(arm.GetConformer().GetPositions(), k=1)
    if not np.isfinite(distance).all() or np.count_nonzero(distance <= 4.5) < 3:
        raise ValueError("The binding-arm pose is not in the selected partner's coordinate frame.")
    if np.any(distance < 0.7):
        raise ValueError("The binary binding-arm pose overlaps a partner atom.")
