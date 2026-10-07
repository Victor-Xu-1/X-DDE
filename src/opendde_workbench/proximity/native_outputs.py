"""Write intact ligand poses and whole partner assemblies, retaining atom lineage."""

from copy import deepcopy
from io import StringIO
from pathlib import Path

import numpy as np
from Bio.PDB import PDBIO
from Bio.PDB.Model import Model
from Bio.PDB.Structure import Structure
from deepternary.models.rotate_utils import rotate_and_translate
from native_proximity_quality import check_candidate
from rdkit import Chem


def ligand_pose(source, positions):
    molecule = deepcopy(source)
    if len(positions) != molecule.GetNumAtoms():
        raise ValueError("Whole-molecule prediction lost an original atom.")
    for index, xyz in enumerate(positions):
        molecule.GetConformer().SetAtomPosition(index, xyz)
    return molecule


def atom_pdb_block(molecule, offset):
    copy = deepcopy(molecule)
    for index, atom in enumerate(copy.GetAtoms()):
        info = Chem.AtomPDBResidueInfo()
        info.SetName(atom.GetSymbol()[0] + f"{index + 1:03d}")
        info.SetResidueName("XLG")
        info.SetResidueNumber(1)
        info.SetChainId("L")
        info.SetIsHeteroAtom(True)
        atom.SetMonomerInfo(info)
    lines = []
    for line in Chem.MolToPDBBlock(copy, flavor=4).splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            lines.append(line[:6] + f"{int(line[6:11]) + offset:5d}" + line[11:])
        elif line.startswith("CONECT"):
            values = [
                int(line[i : i + 5]) + offset
                for i in range(6, len(line), 5)
                if line[i : i + 5].strip()
            ]
            lines.append("CONECT" + "".join(f"{value:5d}" for value in values))
    return lines


def assembly_models(partners, prediction):
    structure = Structure("X_DDE")
    model = Model(0)
    structure.add(model)
    mapping = []
    for index, partner in enumerate(partners):
        chain = next(partner["model"].get_chains()).copy()
        chain.detach_parent()
        chain.id = "AB"[index]
        if index == 1:
            positions = rotate_and_translate(
                partner["coordinates"],
                prediction["rotation"],
                prediction["translation"],
            )
            for atom, xyz in zip(chain.get_atoms(), positions, strict=True):
                atom.coord = np.asarray(xyz, dtype=np.float64)
        model.add(chain)
        mapping.append(
            {"output_chain": chain.id, "source": partner["source"], "atoms": partner["identities"]}
        )
    return structure, mapping


def write_proposal(full, original_indices, arms, partners, prediction, index):
    prefix = f"assembly-{index:03d}"
    output = Path("/output")
    ligand = ligand_pose(full, prediction["ligand_positions"])
    ligand_file = prefix + "-ligand.sdf"
    with Chem.SDWriter(str(output / ligand_file)) as writer:
        writer.write(ligand)
    structure, mapping = assembly_models(partners, prediction)
    stream = StringIO()
    writer = PDBIO()
    writer.set_structure(structure)
    writer.save(stream)
    protein_lines = [
        line
        for line in stream.getvalue().splitlines()
        if line.startswith(("ATOM  ", "HETATM", "TER   "))
    ]
    offset = max(
        int(line[6:11]) for line in protein_lines if line.startswith(("ATOM  ", "HETATM", "TER   "))
    )
    complex_file = prefix + ".pdb"
    (output / complex_file).write_text(
        "\n".join([*protein_lines, *atom_pdb_block(ligand, offset), "END"]) + "\n",
    )
    files = []
    for chain in structure[0]:
        name = prefix + "-partner-" + chain.id.lower() + ".pdb"
        writer.set_structure(chain)
        writer.save(str(output / name))
        files.append(name)
    quality = check_candidate(full, ligand, arms, partners, prediction)
    return {
        "id": prefix,
        "seed": prediction["seed"],
        "complex_artifact": complex_file,
        "ligand_artifact": ligand_file,
        "partner_artifacts": files,
        "ligand_atom_indices": original_indices,
        "partner_mapping": mapping,
        "partner_b_transform": {
            "convention": "output_equals_rotation_times_source_column_plus_translation",
            "rotation": prediction["rotation"].tolist(),
            "translation": prediction["translation"].reshape(-1).tolist(),
        },
        "ranking_surrogate": prediction["ranking_surrogate"],
        "quality": quality,
    }
