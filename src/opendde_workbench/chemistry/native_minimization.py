"""Real RDKit minimization from the submitted coordinates, without conformer generation."""

import hashlib
import math
from pathlib import PurePosixPath

from minimization_geometry import check_geometry, check_stereo, identity
from minimization_options import MinimizationOptions
from sdf_io import read_records


def force_field(molecule, method):
    from rdkit.Chem import AllChem

    if method == "MMFF94s":
        if not AllChem.MMFFHasAllMoleculeParams(molecule):
            raise ValueError(
                "MMFF94s parameters are unavailable; explicitly choose UFF if suitable."
            )
        properties = AllChem.MMFFGetMoleculeProperties(molecule, mmffVariant="MMFF94s")
        field = AllChem.MMFFGetMoleculeForceField(molecule, properties, confId=0)
    else:
        if not AllChem.UFFHasAllMoleculeParams(molecule):
            raise ValueError("UFF parameters are unavailable for this molecule.")
        field = AllChem.UFFGetMoleculeForceField(molecule, confId=0)
    if field is None:
        raise ValueError("The selected force field cannot initialize this pose.")
    field.Initialize()
    return field


def load_pose(request, bindings, job):
    from rdkit import Chem

    ref = request["molecule"]
    if ref.get("conformer", 0):
        raise ValueError("Choose conformer 0 of the exact existing record.")
    binding = PurePosixPath(bindings.get(str(ref["asset_id"]), ""))
    if binding.parts[:2] != ("/", "job") or ".." in binding.parts:
        raise ValueError("The source must be an immutable task input snapshot.")
    file = job.joinpath(*binding.parts[2:])
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Pose snapshot is unsafe or exceeds 25 MiB.")
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref["sha256"]:
        raise ValueError("Pose snapshot changed after input confirmation.")
    if file.suffix == ".sdf":
        molecules = read_records(raw)
    elif file.suffix == ".mol":
        molecules = [
            Chem.MolFromMolBlock(raw.decode("utf-8-sig"), removeHs=False, strictParsing=True)
        ]
    else:
        raise ValueError("Minimization requires an SDF/MOL with explicit chemical bonds.")
    record = ref.get("record", 0)
    if not 0 <= record < len(molecules) or molecules[record] is None:
        raise ValueError("The selected pose record is absent or chemically invalid.")
    molecule = molecules[record]
    if not 2 <= molecule.GetNumAtoms() <= 256 or len(Chem.GetMolFrags(molecule)) != 1:
        raise ValueError("Choose one connected small molecule with 2 to 256 source atoms.")
    check_geometry(molecule)
    return molecule


def run_minimization(request, bindings, job, output):
    from rdkit import Chem, rdBase

    options = MinimizationOptions.model_validate(request["options"])
    source = load_pose(request, bindings, job)
    # Completing implicit H keeps the chemical state; no protonation or embedding is performed.
    work = Chem.AddHs(Chem.Mol(source), addCoords=True)
    final = Chem.Mol(work)  # Preserve graph/atom order before native force-field initialization.
    check_geometry(work)
    field = force_field(work, options.force_field)
    energy_before = field.CalcEnergy()
    code = field.Minimize(maxIts=options.max_iterations, forceTol=1e-4, energyTol=1e-6)
    if code not in {0, 1}:
        raise ValueError("Native force-field minimization failed.")
    for index in range(final.GetNumAtoms()):
        final.GetConformer().SetAtomPosition(index, work.GetConformer().GetAtomPosition(index))
    check_geometry(final)
    check_stereo(source, final)
    final.SetProp("X-DDE optimization", options.force_field)
    final.SetProp("X-DDE source SHA256", request["molecule"]["sha256"])
    file = output / "minimized.sdf"
    writer = Chem.SDWriter(str(file))
    try:
        writer.write(final)
    finally:
        writer.close()
    saved = read_records(file.read_bytes())
    if len(saved) != 1 or saved[0] is None:
        raise ValueError("Optimized pose failed its independent saved-file parse.")
    check_geometry(saved[0])
    check_stereo(source, saved[0])
    energy_after = force_field(saved[0], options.force_field).CalcEnergy()
    if not all(math.isfinite(x) for x in (energy_before, energy_after)):
        raise ValueError("Force-field energy is not finite.")
    if energy_after > energy_before + 1e-3:
        raise ValueError("Optimization increased energy; the current pose is retained.")
    return {
        "operation": "molecule_minimize",
        "complete": True,
        "schema_version": 1,
        "source": request["molecule"],
        "options": options.model_dump(),
        "method": options.force_field,
        "geometry_frame": "unbound_pose",
        "energy_before": energy_before,
        "energy_after": energy_after,
        "energy_unit": "kcal/mol",
        "energy_basis": "hydrogen_completed_same_state",
        "converged": code == 0,
        "artifact": "minimized.sdf",
        "artifact_sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
        "source_atom_count": source.GetNumAtoms(),
        "output_atom_count": saved[0].GetNumAtoms(),
        "source_to_pose_atoms": list(range(source.GetNumAtoms())),
        "identity_smiles": identity(source),
        "identity_preserved": True,
        "coordinate_stereo_preserved": True,
        "software_version": rdBase.rdkitVersion,
    }
