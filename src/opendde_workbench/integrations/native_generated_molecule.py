"""Qualify generated free conformers without inventing source stereochemistry."""

import math

from molfile_stereo import source_stereo_molecule


def prepared_molecule(smiles, seed):
    from rdkit import Chem
    from rdkit.Chem import AllChem

    source = Chem.MolFromSmiles(smiles)
    if (
        source is None
        or len(Chem.GetMolFrags(source)) != 1
        or any(atom.GetAtomicNum() == 0 for atom in source.GetAtoms())
    ):
        raise ValueError("Native generator returned an invalid or disconnected chemical graph.")
    expected = Chem.MolToSmiles(source, isomericSmiles=True)
    molecule = Chem.AddHs(source)
    parameters = AllChem.ETKDGv3()
    parameters.randomSeed = seed
    parameters.numThreads = 1
    parameters.maxIterations = 1000
    if AllChem.EmbedMolecule(molecule, parameters) != 0:
        raise ValueError("Generated molecule has no qualified 3D conformer; embedding failed.")
    if not AllChem.MMFFHasAllMoleculeParams(molecule):
        raise ValueError(
            "Generated molecule lacks MMFF94s parameters; no minimized 3D was published."
        )
    convergence = AllChem.MMFFOptimizeMolecule(molecule, mmffVariant="MMFF94s", maxIters=1000)
    if convergence != 0:
        raise ValueError(
            "Generated conformer did not converge within 1000 MMFF94s iterations; "
            "native sampling outputs are retained for review."
        )
    properties = AllChem.MMFFGetMoleculeProperties(molecule, mmffVariant="MMFF94s")
    force = AllChem.MMFFGetMoleculeForceField(molecule, properties)
    energy = float(force.CalcEnergy())
    if not math.isfinite(energy) or not all(
        math.isfinite(float(value))
        for point in molecule.GetConformer().GetPositions()
        for value in point
    ):
        raise ValueError("Generated conformer returned nonfinite coordinates or energy.")
    exported = source_stereo_molecule(Chem.RemoveHs(molecule))
    if Chem.MolToSmiles(exported, isomericSmiles=True) != expected:
        raise ValueError("Generated conformer changed the declared chemical identity.")
    exported.SetProp("X-DDE conformer method", "ETKDGv3")
    exported.SetIntProp("X-DDE conformer seed", seed)
    exported.SetProp("X-DDE force field", "MMFF94s")
    exported.SetIntProp("X-DDE optimization iteration limit", 1000)
    exported.SetIntProp("X-DDE optimization return code", convergence)
    exported.SetDoubleProp("X-DDE unbound conformer energy (kcal/mol)", energy)
    exported.SetProp(
        "X-DDE stereo specification", "Source specified and unspecified stereo retained"
    )
    return exported, energy
