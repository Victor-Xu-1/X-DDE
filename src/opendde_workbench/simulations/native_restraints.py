"""Resolve selected source identities before applying native OpenMM harmonic forces."""

import json
import math
from pathlib import Path


def atom_key(atom):
    residue = atom.residue
    return (residue.chain.id, int(residue.id), residue.insertionCode.strip(), atom.name)


def unique_atom(topology, key):
    found = [atom for atom in topology.atoms() if atom_key(atom) == key]
    if len(found) != 1:
        raise ValueError(
            "The selected source atom does not resolve uniquely in the prepared system."
        )
    return found[0]


def resolve_atom(selection, request, modeller, source):
    from openmm import unit

    selected = next((item for item in request["inputs"] if item["role"] == selection["role"]), None)
    if selected is None or selected["source"] != selection["source"]:
        raise ValueError("A restraint refers to a stale or different scientific input.")
    if selection["role"] == "structure":
        key = (selection["chain"], selection["number"], selection["insertion"], selection["atom"])
        original = unique_atom(source.topology, key)
        target = unique_atom(modeller.topology, key)
        position = source.positions.value_in_unit(unit.angstrom)[original.index]
    else:
        from native_io import source_molecule

        molecule = source_molecule(request)
        index = selection["index"]
        if index >= molecule.GetNumAtoms():
            raise ValueError("The selected ligand atom is outside its original record.")
        heavy = [atom.GetIdx() for atom in molecule.GetAtoms() if atom.GetAtomicNum() != 1]
        if index not in heavy:
            raise ValueError("Choose heavy atoms for simulation restraints.")
        groups = [residue for residue in modeller.topology.residues() if residue.name == "XLG"]
        if len(groups) != 1:
            raise ValueError("The exact parameterized ligand must resolve to one residue.")
        atoms = [atom for atom in groups[0].atoms() if atom.element.atomic_number != 1]
        if [atom.element.atomic_number for atom in atoms] != [
            molecule.GetAtomWithIdx(i).GetAtomicNum() for i in heavy
        ]:
            raise ValueError(
                "Prepared ligand atom ordering differs from the selected source graph."
            )
        target = atoms[heavy.index(index)]
        position = tuple(molecule.GetConformer().GetAtomPosition(index))
    if target.element is None or target.element.atomic_number == 1:
        raise ValueError("Choose heavy atoms for simulation restraints.")
    current = modeller.positions.value_in_unit(unit.angstrom)[target.index]
    if not all(
        math.isfinite(v)
        for values in (position, current, selection["position_angstrom"])
        for v in values
    ):
        raise ValueError("Restraint source coordinates must be finite.")
    if math.dist(position, selection["position_angstrom"]) > 0.002:
        raise ValueError("Selected coordinates differ from the exact original atom/model.")
    if math.dist(current, position) > 0.002:
        raise ValueError("System preparation moved the selected source atom unexpectedly.")
    return target.index, [float(value) / 10 for value in position]


def apply_restraints(request, modeller, system, source_path):
    conditions = request["payload"].get("restraints", [])
    if not conditions:
        return set()
    import openmm
    from openmm import app

    if request["payload"]["kind"] != "openmm":
        raise ValueError("This condition compiler only executes OpenMM harmonic restraints.")
    source = app.PDBFile(str(source_path))
    periodic = system.usesPeriodicBoundaryConditions()
    expression = (
        "periodicdistance(x,y,z,x0,y0,z0)^2" if periodic else "((x-x0)^2+(y-y0)^2+(z-z0)^2)"
    )
    position_force = openmm.CustomExternalForce("0.5*k*" + expression)
    position_force.setName("X-DDE source positional restraints")
    for parameter in ("k", "x0", "y0", "z0"):
        position_force.addPerParticleParameter(parameter)
    distance_force = openmm.CustomBondForce("0.5*k*(r-r0)^2")
    distance_force.setName("X-DDE selected distance restraints")
    distance_force.addPerBondParameter("k")
    distance_force.addPerBondParameter("r0")
    distance_force.setUsesPeriodicBoundaryConditions(system.usesPeriodicBoundaryConditions())
    rows = []
    for condition in conditions:
        key = condition["kind"]
        selections = (
            [condition["atom"]] if key == "position" else [condition["first"], condition["second"]]
        )
        resolved = [resolve_atom(value, request, modeller, source) for value in selections]
        indices = [item[0] for item in resolved]
        force = condition["force_kj_mol_nm2"]
        if not math.isfinite(force) or not 0 < force <= 100000:
            raise ValueError("The restraint force constant is outside its physical input bounds.")
        if key == "position":
            position_force.addParticle(indices[0], [force, *resolved[0][1]])
        elif key == "distance" and indices[0] != indices[1]:
            distance = condition["distance_angstrom"]
            if not math.isfinite(distance) or not 0.5 < distance <= 100:
                raise ValueError(
                    "The restraint distance must be finite and between0.5and100angstrom."
                )
            distance_force.addBond(*indices, [force, distance / 10])
        else:
            raise ValueError("Select a supported restraint and distinct source atoms.")
        rows.append({"condition": condition, "system_atom_indices": indices})
    if position_force.getNumParticles():
        system.addForce(position_force)
    if distance_force.getNumBonds():
        system.addForce(distance_force)
    Path("/output/restraints.json").write_text(
        json.dumps(
            {
                "method": "OpenMM harmonic positional/distance restraints",
                "scope": "soft_restraints_not_rigid_constraints_or_binding_energy",
                "force_constant_unit": "kJ mol^-1 nm^-2",
                "display_distance_unit": "angstrom",
                "position_reference": "exact_original_input_coordinates",
                "conditions": rows,
            },
            allow_nan=False,
        )
    )
    return {
        index
        for row in rows
        if row["condition"]["kind"] == "position"
        for index in row["system_atom_indices"]
    }
