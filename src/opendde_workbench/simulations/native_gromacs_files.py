"""Parameter-preserving topology export and exact TRR/EDR observations for shared analysis."""

import warnings
from math import isfinite
from pathlib import Path


def export_system(modeller, system):
    import numpy as np
    import parmed
    from openmm import app, unit
    from parmed.exceptions import OpenMMWarning

    # ParmEd must reject forces it cannot represent rather than silently drop them.
    with warnings.catch_warnings():
        warnings.simplefilter("error", OpenMMWarning)
        native = parmed.openmm.load_topology(modeller.topology, system, modeller.positions)
    if native.unknown_functional or len(native.atoms) != system.getNumParticles():
        raise ValueError("The prepared force field cannot be transferred exactly to GROMACS.")
    native.save("/output/system.top", overwrite=False)
    native.save("/output/system.gro", overwrite=False)
    restored = parmed.load_file("/output/system.gro")
    names = [(a.name, a.residue.name) for a in native.atoms]
    if names != [(a.name, a.residue.name) for a in restored.atoms] or not np.allclose(
        native.coordinates, restored.coordinates, rtol=0, atol=0.0051
    ):
        raise ValueError("GROMACS export changed atom ordering or the submitted coordinate frame.")
    with Path("/output/solvated-system.pdb").open("w") as stream:
        app.PDBFile.writeFile(modeller.topology, modeller.positions, stream, keepIds=True)
    return [system.getParticleMass(i).value_in_unit(unit.dalton) for i in range(len(native.atoms))]


def energy_rows(path):
    rows = []
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith(("#", "@")):
            continue
        values = line.split()
        if len(values) != 2:
            raise ValueError("Native GROMACS potential-energy columns are incomplete.")
        values = [float(value) for value in values]
        if not all(isfinite(value) for value in values) or (rows and values[0] <= rows[-1][0]):
            raise ValueError("Native GROMACS energy coordinates are invalid or unordered.")
        rows.append(values)
    if not rows:
        raise ValueError("GROMACS reported no potential-energy observations.")
    return rows


def energy_at(rows, time_ps):
    row = min(rows, key=lambda row: abs(row[0] - time_ps))
    if abs(row[0] - time_ps) > max(1e-5, abs(time_ps) * 1e-8):
        raise ValueError("No native energy observation corresponds to this saved trajectory frame.")
    return row[1]


def sampled_frames(path, topology, payload):
    import mdtraj
    import numpy as np

    native_topology = mdtraj.Topology.from_openmm(topology)
    expected = payload["frames"]
    step_ps = payload["production_ns"] * 1000 / expected
    observed = 0
    for chunk in mdtraj.iterload(str(path), top=native_topology, chunk=10):
        chunk.make_molecules_whole(inplace=True)
        for index, time in enumerate(chunk.time):
            if time == 0:
                continue  # GROMACS includes its initial state; no production was sampled there.
            observed += 1
            if observed > expected or abs(float(time) - observed * step_ps) > max(
                1e-4, float(time) * 2e-7
            ):
                raise ValueError("GROMACS trajectory differs from its requested sampling schedule.")
            box = chunk.unitcell_vectors[index]
            if not np.isfinite(box).all() or np.linalg.det(box) <= 0:
                raise ValueError("GROMACS trajectory lacks a valid periodic box.")
            yield float(time), chunk.xyz[index] * 10, box * 10
    if observed != expected:
        raise ValueError("GROMACS did not produce every declared production frame.")
