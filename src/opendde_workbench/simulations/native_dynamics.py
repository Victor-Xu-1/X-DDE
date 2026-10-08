"""Native NVT equilibration, NPT production, DCD/checkpoint and coordinate analysis."""

from pathlib import Path

from native_io import csv_file, finish, metric
from native_md_analysis import TrajectoryAnalysis
from native_md_system import prepare


def run(request):
    import numpy as np
    import openmm
    from openmm import app, unit

    payload, execution = request["payload"], request["options"]
    modeller, template, topology, solute_indices, ligand = prepare(request)
    output = Path("/output")
    replicas = []
    candidates = []
    for repeat in range(payload["repeats"]):
        prefix = f"repeat-{repeat + 1}"
        system = openmm.XmlSerializer.deserialize(openmm.XmlSerializer.serialize(template))
        integrator = openmm.LangevinMiddleIntegrator(
            payload["temperature_kelvin"] * unit.kelvin,
            1 / unit.picosecond,
            payload["timestep_fs"] * unit.femtosecond,
        )
        seed = (execution["seed"] + repeat) % 2147483647 or 1
        integrator.setRandomNumberSeed(seed)
        platform = openmm.Platform.getPlatformByName(
            "CUDA" if execution["device"] == "cuda" else "CPU"
        )
        properties = (
            {"Threads": str(execution["cpu"])}
            if platform.getName() == "CPU"
            else {"Precision": "mixed"}
        )
        simulation = app.Simulation(modeller.topology, system, integrator, platform, properties)
        simulation.context.setPositions(modeller.positions)
        simulation.minimizeEnergy(maxIterations=5000)
        simulation.context.setVelocitiesToTemperature(
            payload["temperature_kelvin"] * unit.kelvin, seed
        )
        step_ns = payload["timestep_fs"] / 1_000_000
        simulation.step(round(payload["equilibration_ns"] / step_ns))
        barostat = openmm.MonteCarloBarostat(
            1 * unit.bar, payload["temperature_kelvin"] * unit.kelvin, 25
        )
        barostat.setRandomNumberSeed(seed)
        system.addForce(barostat)
        simulation.context.reinitialize(preserveState=True)
        (output / (prefix + "-system.xml")).write_text(openmm.XmlSerializer.serialize(system))
        (output / (prefix + "-integrator.xml")).write_text(
            openmm.XmlSerializer.serialize(integrator)
        )
        nsteps = round(payload["production_ns"] / step_ns)
        interval = max(1, nsteps // payload["frames"])
        dcd = prefix + ".dcd"
        simulation.reporters.append(
            app.DCDReporter(str(output / dcd), interval, enforcePeriodicBox=False)
        )
        simulation.reporters.append(
            app.StateDataReporter(
                str(output / (prefix + "-thermodynamics.csv")),
                interval,
                step=True,
                time=True,
                potentialEnergy=True,
                temperature=True,
                volume=True,
            )
        )
        analysis = TrajectoryAnalysis(
            topology, [system.getParticleMass(i).value_in_unit(unit.dalton) for i in solute_indices]
        )
        snapshots = []
        previous = 0
        for index in range(payload["frames"]):
            target = round((index + 1) * nsteps / payload["frames"])
            simulation.step(target - previous)
            previous = target
            state = simulation.context.getState(
                getPositions=True, getEnergy=True, enforcePeriodicBox=False
            )
            energy = state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
            if not np.isfinite(energy):
                raise ValueError("Dynamics returned nonfinite energy; inspect the prepared system.")
            xyz = state.getPositions(asNumpy=True).value_in_unit(unit.angstrom)[solute_indices]
            box = state.getPeriodicBoxVectors(asNumpy=True).value_in_unit(unit.angstrom)
            aligned, rmsd, ligand_rmsd, rg = analysis.add(xyz, box)
            name = f"{prefix}-frame-{index + 1:04d}.pdb"
            with (output / name).open("w") as stream:
                app.PDBFile.writeFile(topology, aligned * unit.angstrom, stream, keepIds=True)
            snapshots.append(
                {
                    "artifact": name,
                    "time_ns": target * step_ns,
                    "backbone_rmsd_angstrom": rmsd,
                    "ligand_rmsd_angstrom": ligand_rmsd,
                    "radius_gyration_angstrom": rg,
                    "potential_kj_mol": energy,
                }
            )
            simulation.saveCheckpoint(str(output / (prefix + ".chk")))
            if (output / dcd).stat().st_size > 1024**3:
                raise ValueError("Trajectory exceeds the 1 GiB per-replica export budget.")
        simulation.reporters.clear()
        simulation.saveState(str(output / (prefix + "-state.xml")))
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
        replicas.append(
            {
                "repeat": repeat + 1,
                "seed": seed,
                "trajectory": dcd,
                "checkpoint": prefix + ".chk",
                "frames": snapshots,
                "residues": residues,
                "contacts": contacts,
            }
        )
        candidates.append(
            {
                "id": prefix,
                "artifact": snapshots[-1]["artifact"],
                "metrics": [],
                "geometry": "source_frame",
            }
        )
        if ligand is not None:
            from rdkit import Chem

            ligand_indices = [a.index for a in topology.atoms() if a.residue.name == "XLG"]
            if len(ligand_indices) != ligand.GetNumAtoms():
                raise ValueError("Ligand atom correspondence changed during dynamics preparation.")
            for atom, index in enumerate(ligand_indices):
                ligand.GetConformer().SetAtomPosition(atom, aligned[index])
            ligand_name = prefix + "-ligand.sdf"
            with Chem.SDWriter(str(output / ligand_name)) as writer:
                writer.write(ligand)
            candidates.append(
                {
                    "id": prefix + "-ligand",
                    "artifact": ligand_name,
                    "smiles": Chem.MolToSmiles(ligand, isomericSmiles=True),
                    "metrics": [],
                    "geometry": "source_frame",
                }
            )
        del simulation, integrator
    (output / "system.xml").write_text(openmm.XmlSerializer.serialize(template))
    with (output / "solvated-system.pdb").open("w") as stream:
        app.PDBFile.writeFile(modeller.topology, modeller.positions, stream, keepIds=True)
    metrics = [
        metric(
            "Production per repeat",
            payload["production_ns"],
            "ns",
            "OpenMM NPT explicit-water dynamics",
            "descriptor",
        )
    ]
    finish(
        request,
        openmm.__version__,
        candidates,
        metrics,
        structure_artifact=candidates[0]["artifact"],
        dynamics={
            "method": "AMBER14 / TIP3P / OpenFF 2.2.1; NVT equilibration then NPT production",
            "replicas": replicas,
            "reference": "first production snapshot; backbone rigid alignment",
            "contact_definition": (
                "any ligand/receptor heavy-atom distance <= 4 angstrom; not an interaction energy"
            ),
        },
    )
