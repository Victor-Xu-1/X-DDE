"""Explicit-water AMBER14/OpenFF systems; unsupported chemistry fails visibly."""

from native_openmm import add_bound_ligand
from native_structure import input_pdb


def prepare(request):
    import openmm
    from openmm import app, unit
    from pdbfixer import PDBFixer

    if openmm.__version__ != "8.6.1":
        raise ValueError("Install the reviewed OpenMM 8.6.1 environment.")
    source, _ = input_pdb(request)
    payload = request["payload"]
    fixer = PDBFixer(filename=str(source))
    fixer.findMissingResidues()
    if fixer.missingResidues:
        raise ValueError(
            "Resolve missing protein residues before dynamics; no sequence is invented."
        )
    fixer.findNonstandardResidues()
    if fixer.nonstandardResidues:
        raise ValueError("Parameterize modified residues explicitly before dynamics.")
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
    modeller.addSolvent(
        forcefield,
        model="tip3p",
        padding=payload["padding_nm"] * unit.nanometer,
        ionicStrength=payload["salt_molar"] * unit.molar,
        neutralize=True,
    )
    if modeller.topology.getNumAtoms() > 150000:
        raise ValueError("Prepared system exceeds this task's 150,000-atom memory budget.")
    system = forcefield.createSystem(
        modeller.topology,
        nonbondedMethod=app.PME,
        nonbondedCutoff=1 * unit.nanometer,
        constraints=app.HBonds,
        rigidWater=True,
    )
    solvent = {"HOH", "WAT", "NA", "CL"}
    atoms = list(modeller.topology.atoms())
    solute_indices = [a.index for a in atoms if a.residue.name not in solvent]
    preview = app.Modeller(modeller.topology, modeller.positions)
    preview.delete([r for r in preview.topology.residues() if r.name in solvent])
    if not solute_indices or len(solute_indices) > 30000:
        raise ValueError("Select a bounded solute for interactive trajectory inspection.")
    return modeller, system, preview.topology, solute_indices, ligand
