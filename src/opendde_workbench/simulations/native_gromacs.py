"""GROMACS native minimization/NVT/NPT in the existing X-DDE lifecycle and result authority."""

from pathlib import Path

from native_gromacs_files import energy_at, energy_rows, export_system, sampled_frames
from native_gromacs_protocol import VERSION, command, stage, verify_runtime
from native_io import finish, metric
from native_md_analysis import TrajectoryAnalysis
from native_md_outputs import repeat_outputs
from native_md_system import prepare


def run(request):
    import openmm
    from openmm import app, unit

    payload = request["payload"]
    verify_runtime(request["options"]["device"])
    modeller, system, topology, solute_indices, ligand = prepare(request)
    masses = export_system(modeller, system)
    output = Path("/output")
    (output / "prepared-system.xml").write_text(openmm.XmlSerializer.serialize(system))
    replicas, candidates = [], []
    for repeat in range(payload["repeats"]):
        prefix = f"repeat-{repeat + 1}"
        seed = (request["options"]["seed"] + repeat) % 2147483647 or 1
        stage(request, prefix + "-minimize", "minimize", "system.gro", seed)
        stage(request, prefix + "-nvt", "equilibrate", prefix + "-minimize.gro", seed)
        stage(
            request, prefix, "production", prefix + "-nvt.gro", seed, checkpoint=prefix + "-nvt.cpt"
        )
        trajectory = output / (prefix + ".trr")
        if not trajectory.is_file() or trajectory.stat().st_size > 1024**3:
            raise ValueError("Native GROMACS trajectory is absent or exceeds its 1 GiB budget.")
        command(
            ["energy", "-f", prefix + ".edr", "-o", prefix + "-potential.xvg"],
            input_text="Potential\n0\n",
        )
        observations = energy_rows(output / (prefix + "-potential.xvg"))
        analysis = TrajectoryAnalysis(topology, [masses[i] for i in solute_indices])
        snapshots = []
        for index, (time_ps, positions, box) in enumerate(
            sampled_frames(trajectory, modeller.topology, payload)
        ):
            aligned, rmsd, ligand_rmsd, rg = analysis.add(positions[solute_indices], box)
            name = f"{prefix}-frame-{index + 1:04d}.pdb"
            with (output / name).open("w") as stream:
                app.PDBFile.writeFile(topology, aligned * unit.angstrom, stream, keepIds=True)
            snapshots.append(
                {
                    "artifact": name,
                    "time_ns": time_ps / 1000,
                    "backbone_rmsd_angstrom": rmsd,
                    "ligand_rmsd_angstrom": ligand_rmsd,
                    "radius_gyration_angstrom": rg,
                    "potential_kj_mol": energy_at(observations, time_ps),
                }
            )
        row, poses = repeat_outputs(
            prefix, seed, trajectory.name, prefix + ".cpt", snapshots, analysis, topology, ligand
        )
        replicas.append(row)
        candidates.extend(poses)
    finish(
        request,
        VERSION,
        candidates,
        [
            metric(
                "Production per repeat",
                payload["production_ns"],
                "ns",
                "GROMACS NPT explicit-water dynamics",
                "descriptor",
            )
        ],
        structure_artifact=candidates[0]["artifact"],
        dynamics={
            "method": "GROMACS 2026.3 / AMBER14 / TIP3P / OpenFF 2.2.1; V-rescale NVT / "
            "C-rescale NPT",
            "replicas": replicas,
            "reference": "first production snapshot; backbone rigid alignment",
            "contact_definition": "any ligand/receptor heavy-atom distance <= 4 angstrom; "
            "not an interaction energy",
        },
    )
