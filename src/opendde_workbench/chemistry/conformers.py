"""Seeded free conformers and explicit force-field applicability/convergence."""

import math

from mapping import correspondence


def prepare_conformers(source, molecule, options):
    from rdkit import Chem
    from rdkit.Chem import AllChem

    if not options.conformers_per_state:
        return [], "not_requested"
    mol = Chem.AddHs(molecule)
    params = AllChem.ETKDGv3()
    params.randomSeed = options.seed
    params.numThreads = options.cpu
    params.maxIterations = options.embedding_iterations
    params.pruneRmsThresh = options.prune_rmsd
    identifiers = list(
        AllChem.EmbedMultipleConfs(mol, numConfs=options.conformers_per_state, params=params)
    )
    if not identifiers:
        return [], "embedding_failed"
    available = options.force_field == "none" or (
        AllChem.MMFFHasAllMoleculeParams(mol)
        if options.force_field == "MMFF94s"
        else AllChem.UFFHasAllMoleculeParams(mol)
    )
    if not available:
        return [], "force_field_parameters_unavailable"
    rows = []
    for identifier in identifiers:
        energy, converged = None, None
        if options.force_field == "MMFF94s":
            properties = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s")
            force = AllChem.MMFFGetMoleculeForceField(mol, properties, confId=identifier)
        elif options.force_field == "UFF":
            force = AllChem.UFFGetMoleculeForceField(mol, confId=identifier)
        else:
            force = None
        if force is not None:
            converged = force.Minimize(maxIts=options.optimization_iterations) == 0
            energy = float(force.CalcEnergy())
            if not math.isfinite(energy):
                raise ValueError("Conformer optimization returned nonfinite energy.")
        copy = Chem.Mol(mol)
        conformer = Chem.Conformer(mol.GetConformer(identifier))
        copy.RemoveAllConformers()
        copy.AddConformer(conformer, assignId=True)
        copy = Chem.RemoveHs(copy)
        if not all(
            math.isfinite(float(v)) for row in copy.GetConformer().GetPositions() for v in row
        ):
            raise ValueError("Conformer generation returned nonfinite coordinates.")
        mapping = correspondence(source, copy)
        rows.append(
            {
                "molecule": copy,
                "source_to_conformer_atoms": mapping,
                "native_conformer": identifier,
                "energy": energy,
                "converged": converged,
            }
        )
    return rows, "completed"
