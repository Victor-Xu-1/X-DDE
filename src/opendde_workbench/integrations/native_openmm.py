"""Prepare resolved atoms and perform restrained native OpenMM minimization."""

from pathlib import Path

from native_io import finish, input_file, metric, source_molecule


def add_bound_ligand(modeller, request):
    import numpy as np
    from openff.toolkit import Molecule
    from openff.units import unit as ffunit
    from openmm import unit
    from rdkit import Chem

    ligand = Chem.AddHs(source_molecule(request), addCoords=True)
    if not ligand.GetNumConformers() or not ligand.GetConformer().Is3D():
        raise ValueError("Complex refinement requires the exact bound 3D ligand pose.")
    heavy = [
        (atom.GetAtomicNum(), np.asarray(ligand.GetConformer().GetAtomPosition(atom.GetIdx())))
        for atom in ligand.GetAtoms()
        if atom.GetAtomicNum() != 1
    ]
    water = {"HOH", "WAT"}
    candidates = []
    positions = modeller.positions.value_in_unit(unit.angstrom)
    for residue in modeller.topology.residues():
        atoms = [a for a in residue.atoms() if a.element and a.element.atomic_number != 1]
        if residue.name in water or len(atoms) != len(heavy):
            continue
        # The supplied SDF is authoritative; matching never infers its bond orders from a PDB.
        if all(
            min(
                (
                    np.linalg.norm(point - positions[a.index])
                    for a in atoms
                    if a.element.atomic_number == element
                ),
                default=100,
            )
            < 0.15
            for element, point in heavy
        ):
            candidates.append(residue)
    if len(candidates) > 1:
        raise ValueError(
            "The bound ligand maps to multiple structural residues; select a single complex."
        )
    if candidates:
        modeller.delete(candidates)
    elif any(
        min(np.linalg.norm(point - position) for position in positions) < 0.8 for _, point in heavy
    ):
        raise ValueError(
            "Ligand coordinates overlap a structure but do not map to its chemical residue."
        )
    elif min(np.linalg.norm(point - position) for _, point in heavy for position in positions) > 6:
        raise ValueError("The ligand is outside the receptor coordinate frame; dock it first.")
    molecule = Molecule.from_rdkit(ligand, allow_undefined_stereo=False)
    if [atom.atomic_number for atom in molecule.atoms] != [
        atom.GetAtomicNum() for atom in ligand.GetAtoms()
    ]:
        raise ValueError("Force-field preparation changed the exact ligand atom correspondence.")
    topology = molecule.to_topology().to_openmm()
    for residue in topology.residues():
        residue.name = "XLG"
    modeller.add(
        topology,
        molecule.conformers[0].to(ffunit.nanometer).magnitude * unit.nanometer,
    )
    return molecule, ligand


def run(request):
    import numpy as np
    import openmm
    from openmm import app, unit
    from pdbfixer import PDBFixer

    source, _ = input_file(request, "structure")
    payload = request["payload"]
    fixer = PDBFixer(filename=str(source))
    fixer.findMissingResidues()
    if any(
        index not in {0, len(list(list(fixer.topology.chains())[chain].residues()))}
        for (chain, index) in fixer.missingResidues
    ):
        raise ValueError(
            "Prepare internal unresolved receptor gaps as explicit fragments before refinement."
        )
    fixer.missingResidues = {}
    fixer.findNonstandardResidues()
    if fixer.nonstandardResidues:
        raise ValueError(
            "Prepare nonstandard residues explicitly; refinement never silently replaces them."
        )
    fixer.findMissingAtoms()
    fixer.addMissingAtoms(seed=request["options"]["seed"])
    modeller = app.Modeller(fixer.topology, fixer.positions)
    forcefield = app.ForceField("amber14-all.xml", "amber14/tip3p.xml")
    ligand = None
    if any(item["role"] == "ligand" for item in request["inputs"]):
        from openmmforcefields.generators import SMIRNOFFTemplateGenerator

        molecule, ligand = add_bound_ligand(modeller, request)
        generator = SMIRNOFFTemplateGenerator(molecules=molecule, forcefield="openff-2.2.1")
        forcefield.registerTemplateGenerator(generator.generator)
    modeller.addHydrogens(forcefield, pH=payload["ph"])
    # Adding protein hydrogens changes atom indices. Select the explicit added ligand residue again.
    ligand_indices = []
    if ligand is not None:
        ligand_indices = [
            atom.index
            for residue in modeller.topology.residues()
            if residue.name == "XLG"
            for atom in residue.atoms()
        ]
        if len(ligand_indices) != ligand.GetNumAtoms():
            raise ValueError(
                "Prepared ligand atom identities are ambiguous after protein hydrogenation."
            )
    system = forcefield.createSystem(
        modeller.topology, nonbondedMethod=app.NoCutoff, constraints=app.HBonds
    )
    if payload["restrain_backbone"]:
        restraint = openmm.CustomExternalForce("0.5*k*((x-x0)^2+(y-y0)^2+(z-z0)^2)")
        restraint.addGlobalParameter("k", payload["restraint_kj_mol_nm2"])
        for name in ("x0", "y0", "z0"):
            restraint.addPerParticleParameter(name)
        positions = modeller.positions.value_in_unit(unit.nanometer)
        for atom in modeller.topology.atoms():
            if atom.name in {"N", "CA", "C", "O"}:
                restraint.addParticle(atom.index, positions[atom.index])
        system.addForce(restraint)
    integrator = openmm.VerletIntegrator(0.001 * unit.picoseconds)
    platform = openmm.Platform.getPlatformByName(
        "CUDA" if request["options"]["device"] == "cuda" else "CPU"
    )
    properties = {"Threads": str(request["options"]["cpu"])} if platform.getName() == "CPU" else {}
    simulation = app.Simulation(modeller.topology, system, integrator, platform, properties)
    simulation.context.setPositions(modeller.positions)
    initial = (
        simulation.context.getState(getEnergy=True)
        .getPotentialEnergy()
        .value_in_unit(unit.kilojoule_per_mole)
    )
    simulation.minimizeEnergy(maxIterations=payload["iterations"])
    state = simulation.context.getState(getEnergy=True, getPositions=True)
    final = state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
    if not np.isfinite(initial) or not np.isfinite(final) or final > initial + 0.01:
        raise ValueError(
            "Native minimization did not return a finite non-increasing potential energy."
        )
    structure_name = "refined-structure.pdb"
    with Path("/output", structure_name).open("w") as stream:
        app.PDBFile.writeFile(modeller.topology, state.getPositions(), stream, keepIds=True)
    metrics = [
        metric("Initial potential energy", initial, "kJ/mol", "OpenMM vacuum potential", "energy"),
        metric("Final potential energy", final, "kJ/mol", "OpenMM vacuum potential", "energy"),
    ]
    candidates = [
        {
            "id": "refined-structure",
            "artifact": structure_name,
            "metrics": metrics,
            "geometry": "source_frame",
        }
    ]
    if ligand is not None:
        from rdkit import Chem

        coordinates = state.getPositions(asNumpy=True).value_in_unit(unit.angstrom)
        for atom, index in enumerate(ligand_indices):
            ligand.GetConformer().SetAtomPosition(atom, coordinates[index])
        with Chem.SDWriter("/output/refined-ligand.sdf") as writer:
            writer.write(ligand)
        candidates.append(
            {
                "id": "refined-ligand",
                "artifact": "refined-ligand.sdf",
                "metrics": [],
                "geometry": "source_frame",
            }
        )
    finish(request, openmm.__version__, candidates, structure_artifact=structure_name)
