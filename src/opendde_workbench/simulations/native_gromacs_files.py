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


def sample_time(step, header_time, index, payload):
    steps = round(payload["production_ns"] * 1_000_000 / payload["timestep_fs"])
    if step != index * (steps // payload["frames"]):
        raise ValueError("GROMACS trajectory differs from its requested integration steps.")
    time_ps = int(step) * payload["timestep_fs"] / 1000
    if not isfinite(float(header_time)) or abs(float(header_time) - time_ps) > max(
        1e-4, abs(time_ps) * 2e-7
    ):
        raise ValueError("GROMACS trajectory time disagrees with its native integration step.")
    return time_ps


def sampled_frames(path, topology, payload):
    import mdtraj
    import numpy as np

    native_topology = mdtraj.Topology.from_openmm(topology)
    expected = payload["frames"]
    observed = 0
    # Keep the native integer MD step. A float32 reader timestamp alone loses
    # enough precision in long runs to mismatch otherwise valid EDR observations.
    with mdtraj.formats.TRRTrajectoryFile(str(path), mode="r") as stream:
        while True:
            xyz, times, steps, boxes, _ = stream.read(n_frames=10)
            if not len(xyz):
                break
            chunk = mdtraj.Trajectory(xyz, native_topology, time=times)
            chunk.unitcell_vectors = boxes
            chunk.make_molecules_whole(inplace=True)
            for index, step in enumerate(steps):
                if step == 0:
                    continue  # Native initial state, not a production observation.
                observed += 1
                if observed > expected:
                    raise ValueError("GROMACS reported more frames than the requested sampling.")
                time_ps = sample_time(step, times[index], observed, payload)
                box = chunk.unitcell_vectors[index]
                if not np.isfinite(box).all() or np.linalg.det(box) <= 0:
                    raise ValueError("GROMACS trajectory lacks a valid periodic box.")
                yield time_ps, chunk.xyz[index] * 10, box * 10
    if observed != expected:
        raise ValueError("GROMACS did not produce every declared production frame.")
