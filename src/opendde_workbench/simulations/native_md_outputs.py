"""One output contract for OpenMM/GROMACS: raw observations and original ligand identities."""

from pathlib import Path

from native_io import csv_file


def repeat_outputs(prefix, seed, trajectory, checkpoint, snapshots, analysis, topology, ligand):
    residues, contacts = analysis.finish()
    csv_file(
        prefix + "-stability.csv",
        ["time_ns", "backbone_RMSD_A", "ligand_RMSD_A", "Rg_A", "potential_kJ_mol"],
        [
            [
                r["time_ns"],
                r["backbone_rmsd_angstrom"],
                r["ligand_rmsd_angstrom"],
                r["radius_gyration_angstrom"],
                r["potential_kj_mol"],
            ]
            for r in snapshots
        ],
    )
    repeat = {
        "repeat": int(prefix.split("-")[1]),
        "seed": seed,
        "trajectory": trajectory,
        "checkpoint": checkpoint,
        "frames": snapshots,
        "residues": residues,
        "contacts": contacts,
    }
    candidates = [
        {
            "id": prefix,
            "artifact": snapshots[-1]["artifact"],
            "metrics": [],
            "geometry": "source_frame",
        }
    ]
    if ligand is not None:
        from rdkit import Chem

        pose = Chem.Mol(ligand)
        indices = [a.index for a in topology.atoms() if a.residue.name == "XLG"]
        if len(indices) != pose.GetNumAtoms():
            raise ValueError("Ligand atom correspondence changed during dynamics preparation.")
        # Retain the full-precision calculated coordinates, not the rounded PDB depiction.
        coordinates = analysis.frames[-1]
        for atom, index in enumerate(indices):
            pose.GetConformer().SetAtomPosition(atom, coordinates[index])
        name = prefix + "-ligand.sdf"
        with Chem.SDWriter(str(Path("/output", name))) as writer:
            writer.write(pose)
        candidates.append(
            {
                "id": prefix + "-ligand",
                "artifact": name,
                "smiles": Chem.MolToSmiles(pose, isomericSmiles=True),
                "metrics": [],
                "geometry": "source_frame",
            }
        )
    return repeat, candidates
